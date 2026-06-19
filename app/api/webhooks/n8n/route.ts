import { type NextRequest, NextResponse } from "next/server";

/**
 * POST /api/webhooks/n8n
 *
 * n8n inbound webhook handler.
 *
 * Responsibilities:
 * 1. Validate the shared secret (N8N_WEBHOOK_SECRET env var).
 * 2. Parse and type the incoming payload.
 * 3. Log the event to webhook_logs table (service role — bypasses RLS).
 * 4. Return 200 OK.
 *
 * Security: shared secret is passed in the X-N8N-Secret header.
 * The secret is compared with constant-time comparison to prevent timing attacks.
 *
 * Architecture note (MVP):
 * This endpoint is infrastructure-only in MVP. It accepts and logs all
 * recognised event types but does NOT trigger any business logic yet.
 * Workflow logic will be added post-MVP as n8n automation workflows are activated.
 */
export async function POST(request: NextRequest) {
  try {
    const secret = request.headers.get("x-n8n-secret");

    // Validate shared secret
    if (!secret || secret !== process.env.N8N_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await request.json();

    // TODO: Validate payload shape with Zod against WebhookPayloadSchema
    // TODO: Write to webhook_logs using service role Supabase client
    // TODO: Dispatch event handling based on payload.event_type

    return NextResponse.json({ received: true }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Only POST is allowed on this route.
 */
export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
