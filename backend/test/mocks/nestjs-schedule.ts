// Jest-only stand-in for '@nestjs/schedule': that package ships ESM-only output that ts-jest's
// CommonJS transform cannot load (same issue as nestjs-jwt.ts). No unit test in this repo actually
// needs a cron job to really fire - the decorator just needs to be a no-op so the decorated method
// stays a plain, directly-callable method for tests to invoke.
export function Cron(..._args: unknown[]): MethodDecorator {
    return () => undefined;
}

export const CronExpression = {
    EVERY_DAY_AT_4AM: '0 4 * * *',
} as const;

export class ScheduleModule {
    static forRoot(..._args: unknown[]) { return { module: ScheduleModule }; }
}
