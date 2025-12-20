import { Request, Response } from "express";

export function notFoundHandler(req: Request, res: Response) {
  console.log(`❌ 404 NOT FOUND: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: "Route not found" });
}
