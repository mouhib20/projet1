// Jest-only stand-in for '@nestjs/jwt': that package ships ESM-only output that ts-jest's
// CommonJS transform cannot load, and it re-exports jsonwebtoken's error classes in a way that
// breaks the CJS/ESM interop further. No unit test in this repo actually needs real JWT signing
// or verification (the JwtService is always provided via a mock or never invoked), so this stub
// only needs to satisfy the class/type references that other modules import statically.
export class JwtService {
    sign(..._args: unknown[]): string { return ''; }
    verify(..._args: unknown[]): unknown { return {}; }
    decode(..._args: unknown[]): unknown { return {}; }
}

export class JwtModule {
    static register(..._args: unknown[]) { return { module: JwtModule }; }
    static registerAsync(..._args: unknown[]) { return { module: JwtModule }; }
}
