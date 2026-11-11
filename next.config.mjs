export default {
  output: "standalone",
  devIndicators: false,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination:
          (process.env.BANK_API || "http://bank:8000") + "/api/:path*",
      },
    ];
  },
};
