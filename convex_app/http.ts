import { httpRouter } from "convex/server";
import { searchHandler } from "./music";

const http = httpRouter();

http.route({
  path: "/music/search",
  method: "GET",
  handler: searchHandler,
});

http.route({
  path: "/music/search",
  method: "OPTIONS",
  handler: searchHandler,
});

export default http;
