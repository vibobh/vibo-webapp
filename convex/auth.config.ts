export default {
  providers: [
    {
      domain: process.env.AUTH_ISSUER_URL ?? "https://joinvibo.com",
      applicationID: "convex",
    },
  ],
};
