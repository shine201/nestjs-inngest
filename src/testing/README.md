# NestJS Inngest Testing Guide

本指南介绍如何使用两种不同的测试模式来测试您的Inngest集成。

## 🎭 测试模式

### 1. Mock模式 (默认)
- ✅ **快速**: 无网络调用，适合CI/CD
- ✅ **可靠**: 不依赖外部服务
- ✅ **离线**: 可以在没有网络的情况下运行
- ❌ **有限**: 无法测试真实的API集成

### 2. 真实API模式
- ✅ **完整**: 测试与真实Inngest服务的集成
- ✅ **真实**: 验证实际的网络调用和响应
- ✅ **生产级**: 确保在生产环境中正常工作
- ❌ **依赖**: 需要网络连接和API凭据

## 🚀 快速开始

### Mock模式 (默认)

```typescript
import { InngestTestingModule } from '@your-package/testing';

describe('My Inngest Integration', () => {
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        InngestTestingModule.forSmartIntegrationTest({
          additionalProviders: [MyService],
        }),
      ],
    }).compile();
    
    // 测试将自动使用mock模式
  });
});
```

### 真实API模式

1. **获取Inngest凭据**:
   - 访问 [inngest.com](https://inngest.com) 注册账户
   - 创建一个应用并获取凭据

2. **设置环境变量**:
   ```bash
   # .env.test 或直接设置环境变量
   INNGEST_USE_REAL_API=true
   INNGEST_APP_ID=your-app-id
   INNGEST_EVENT_KEY=your-event-key
   INNGEST_SIGNING_KEY=your-signing-key
   ```

3. **运行测试**:
   ```bash
   # 使用真实API运行测试
   INNGEST_USE_REAL_API=true npm test
   
   # 或使用端到端测试模式
   NODE_ENV=e2e npm test
   ```

## 🔧 配置选项

### 环境变量

| 变量名 | 描述 | 必需(真实API) |
|--------|------|---------------|
| `INNGEST_USE_REAL_API` | 启用真实API模式 (`true`/`false`) | - |
| `INNGEST_APP_ID` | 您的Inngest应用ID | ✅ |
| `INNGEST_EVENT_KEY` | 用于发送事件的密钥 | ✅ |
| `INNGEST_SIGNING_KEY` | 用于webhook验证的密钥 | ✅ |
| `INNGEST_BASE_URL` | 自定义Inngest API URL | ❌ |
| `NODE_ENV` | 设置为 `e2e` 自动启用真实API | - |

### 测试配置示例

```typescript
// 强制使用mock模式
const module = await Test.createTestingModule({
  imports: [
    InngestTestingModule.forTest({
      useRealServices: false, // 强制mock
      mockConfig: {
        appId: 'my-test-app',
        isDev: true,
      },
    }),
  ],
}).compile();

// 强制使用真实API模式
const module = await Test.createTestingModule({
  imports: [
    InngestTestingModule.forTest({
      useRealServices: true,
      mockConfig: {
        appId: process.env.INNGEST_APP_ID,
        eventKey: process.env.INNGEST_EVENT_KEY,
        signingKey: process.env.INNGEST_SIGNING_KEY,
      },
    }),
  ],
}).compile();

// 智能模式 (推荐)
const module = await Test.createTestingModule({
  imports: [
    InngestTestingModule.forSmartIntegrationTest({
      additionalProviders: [MyService],
    }),
  ],
}).compile();
```

## 🧪 测试实用工具

### 访问测试服务

```typescript
describe('Event sending', () => {
  let inngestService: TestIntegrationInngestService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [InngestTestingModule.forSmartIntegrationTest()],
    }).compile();

    inngestService = module.get(InngestService);
  });

  it('should send events', async () => {
    await inngestService.send({
      name: 'user.created',
      data: { userId: '123' },
    });

    // 在两种模式下都可以使用测试工具
    expect(inngestService.getSentEvents()).toHaveLength(1);
    expect(inngestService.wasEventSent('user.created')).toBe(true);
  });
});
```

### 可用的测试方法

```typescript
// 获取所有发送的事件
const events = inngestService.getSentEvents();

// 按名称过滤事件
const userEvents = inngestService.getSentEventsByName('user.created');

// 检查特定事件是否被发送
const wasSent = inngestService.wasEventSent('user.created', { userId: '123' });

// 获取发送历史
const history = inngestService.getSendCallHistory();

// 清除测试历史
inngestService.clearTestHistory();

// 获取最后发送的事件
const lastEvent = inngestService.getLastSentEvent();
```

## 🏃‍♂️ 运行不同的测试模式

### 开发时 (Mock模式)
```bash
npm test
```

### CI/CD (Mock模式)
```bash
npm test
```

### 本地真实API测试
```bash
# 设置凭据后
INNGEST_USE_REAL_API=true npm test
```

### 端到端测试
```bash
NODE_ENV=e2e npm test
```

## 🔍 故障排除

### Mock模式问题
- 确保没有设置 `INNGEST_USE_REAL_API=true`
- 检查测试是否使用了正确的测试模块

### 真实API模式问题
- 验证所有必需的环境变量都已设置
- 检查网络连接
- 确认Inngest凭据是否正确

### 混合使用
- 某些测试可以使用mock模式进行快速验证
- 关键功能测试可以使用真实API模式
- 使用 `forSmartIntegrationTest()` 让系统自动选择最佳模式

## 📋 最佳实践

1. **开发阶段**: 使用Mock模式进行快速迭代
2. **CI/CD**: 使用Mock模式确保稳定性
3. **集成测试**: 定期使用真实API模式验证
4. **生产部署前**: 运行完整的真实API测试套件

这样您就可以享受两种方法的优势！🎯