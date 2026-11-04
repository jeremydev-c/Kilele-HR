import mongoose, { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { AppError } from "./errors";

/**
 * CVs live in MongoDB itself (GridFS), not on a file host: nothing extra to
 * set up, they're backed up with the database, and the demo works offline.
 *
 * Only real PDFs are accepted (checked by the file's first bytes, not its
 * name): a PDF can't carry Word macros, and every browser can preview it.
 */

export const MAX_CV_BYTES = 2 * 1024 * 1024;

async function bucket() {
  const conn = await connectDB();
  return new mongoose.mongo.GridFSBucket(conn.connection.db!, { bucketName: "cvs" });
}

export function assertPdf(bytes: Uint8Array) {
  if (bytes.byteLength === 0) throw new AppError("Attach your CV as a PDF.");
  if (bytes.byteLength > MAX_CV_BYTES) throw new AppError("Your CV is over 2 MB. Please attach a smaller PDF.");
  const magic = new TextDecoder().decode(bytes.slice(0, 5));
  if (magic !== "%PDF-") throw new AppError("Your CV must be a PDF file.");
}

export async function saveCv(bytes: Uint8Array, filename: string): Promise<Types.ObjectId> {
  assertPdf(bytes);
  const b = await bucket();
  const safeName = filename.replace(/[^\w.\- ]+/g, "_").slice(0, 100) || "cv.pdf";
  return new Promise((resolve, reject) => {
    const up = b.openUploadStream(safeName, { metadata: { contentType: "application/pdf" } });
    up.on("error", reject);
    up.on("finish", () => resolve(up.id as Types.ObjectId));
    up.end(Buffer.from(bytes));
  });
}

export async function readCv(id: Types.ObjectId | string): Promise<Buffer> {
  const b = await bucket();
  const chunks: Buffer[] = [];
  for await (const chunk of b.openDownloadStream(new Types.ObjectId(String(id)))) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}
