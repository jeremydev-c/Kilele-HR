import { getCtx } from "@/server/context";
import { cvForViewing } from "@/server/services/recruitment";
import { ForbiddenError, NotFoundError } from "@/server/errors";

/** Streams a CV to people allowed to see that application. Every view is audited. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx();
  if (!ctx) return new Response("Sign in first.", { status: 401 });
  try {
    const { bytes, filename } = await cvForViewing(ctx, (await params).id);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof ForbiddenError) return new Response("Not allowed.", { status: 403 });
    if (err instanceof NotFoundError) return new Response("Not found.", { status: 404 });
    throw err;
  }
}
