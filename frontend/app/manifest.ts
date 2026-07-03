import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MRP Traceability",
    short_name: "MRP",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#172554",
  };
}
