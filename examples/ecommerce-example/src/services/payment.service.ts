import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment, PaymentStatus } from '../entities/payment.entity';
import { InngestService } from 'nestjs-inngest';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    private readonly inngestService: InngestService,
  ) {}

  async processPayment(orderId: string, paymentData: any) {
    this.logger.log(`Processing payment for order ${orderId}`);

    const payment = this.paymentRepository.create({
      orderId,
      customerId: paymentData.customerId || 'unknown',
      method: paymentData.method || 'card',
      amount: paymentData.amount,
      status: PaymentStatus.PROCESSING,
    });

    const savedPayment = await this.paymentRepository.save(payment);

    try {
      // Simulate payment processing
      await this.simulatePaymentGateway(paymentData);

      // Update payment status
      savedPayment.status = PaymentStatus.COMPLETED;
      savedPayment.processedAt = new Date();
      savedPayment.externalTransactionId = `txn_${Date.now()}`;

      await this.paymentRepository.save(savedPayment);

      // Send success event
      await this.inngestService.send({
        name: 'payment.processed',
        data: {
          orderId,
          paymentId: savedPayment.id,
          customerId: savedPayment.customerId,
          amount: savedPayment.amount,
          method: savedPayment.method,
          transactionId: savedPayment.externalTransactionId,
          processedAt: savedPayment.processedAt.toISOString(),
        },
      });

      return { success: true, paymentId: savedPayment.id };

    } catch (error) {
      this.logger.error(`Payment failed for order ${orderId}: ${error.message}`);

      savedPayment.status = PaymentStatus.FAILED;
      savedPayment.failedAt = new Date();
      savedPayment.failureReason = error.message;

      await this.paymentRepository.save(savedPayment);

      // Send failure event
      await this.inngestService.send({
        name: 'payment.failed',
        data: {
          orderId,
          paymentId: savedPayment.id,
          customerId: savedPayment.customerId,
          amount: savedPayment.amount,
          method: savedPayment.method,
          error: error.message,
          errorCode: 'processing_error',
          failedAt: savedPayment.failedAt.toISOString(),
          retryable: true,
        },
      });

      throw error;
    }
  }

  async processRefund(orderId: string, amount: number, reason: string) {
    this.logger.log(`Processing refund for order ${orderId}: ${amount}`);

    const payment = await this.paymentRepository.findOne({
      where: { orderId, status: PaymentStatus.COMPLETED },
    });

    if (!payment) {
      throw new Error(`No completed payment found for order ${orderId}`);
    }

    // Simulate refund processing
    payment.status = PaymentStatus.REFUNDED;
    payment.refundedAmount = amount;

    await this.paymentRepository.save(payment);

    await this.inngestService.send({
      name: 'payment.refunded',
      data: {
        orderId,
        paymentId: payment.id,
        refundId: `ref_${Date.now()}`,
        amount,
        reason,
        refundedAt: new Date().toISOString(),
      },
    });

    return { success: true, refundAmount: amount };
  }

  async reversePayment(orderId: string, reason: string) {
    this.logger.log(`Reversing payment for order ${orderId}: ${reason}`);
    
    const payment = await this.paymentRepository.findOne({
      where: { orderId },
    });

    if (payment && payment.status === PaymentStatus.COMPLETED) {
      return this.processRefund(orderId, payment.amount, reason);
    }

    return { success: true, message: 'No payment to reverse' };
  }

  private async simulatePaymentGateway(paymentData: any) {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Simulate failure for testing
    if (paymentData.cardToken === 'tok_chargeDeclined') {
      throw new Error('Your card was declined');
    }

    return { success: true };
  }
}