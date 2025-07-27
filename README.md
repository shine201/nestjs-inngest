# nest-inngest

NestJS integration for Inngest event-driven functions.

## Installation

```bash
npm install nestjs-inngest inngest
```

## Quick Start

```typescript
// app.module.ts
import { Module } from "@nestjs/common";
import { InngestModule } from "nestjs-inngest";

@Module({
  imports: [
    InngestModule.forRoot({
      appId: "my-app",
      eventKey: process.env.INNGEST_EVENT_KEY,
      signingKey: process.env.INNGEST_SIGNING_KEY,
    }),
  ],
})
export class AppModule {}
```

## Documentation

Full documentation will be available once the library is complete.

## License

MIT
