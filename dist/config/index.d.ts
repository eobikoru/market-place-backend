import 'dotenv/config';
export declare const config: {
    readonly env: string;
    readonly port: number;
    readonly apiPrefix: string;
    readonly database: {
        readonly url: string;
    };
    readonly jwt: {
        readonly secret: string;
        readonly expiresIn: string;
    };
    readonly cors: {
        readonly origins: string[];
    };
    readonly paystack: {
        readonly secretKey: string;
        readonly publicKey: string;
    };
    readonly mapbox: {
        readonly token: string;
    };
};
//# sourceMappingURL=index.d.ts.map