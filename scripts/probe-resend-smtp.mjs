/**
 * probe-resend-smtp — ask Resend directly what YOUR account is allowed to send.
 *
 * WHY THIS EXISTS
 *   Resend's documentation says the shared `resend.dev` sender may only deliver
 *   to the Resend account owner's own address. Documentation describes the
 *   general policy; this asks the actual server about the actual account,
 *   because a policy page cannot tell you whether a particular team has been
 *   granted an exception.
 *
 *   It speaks the same protocol Supabase Auth speaks — SMTP on
 *   smtp.resend.com:587 with STARTTLS — so a success here means Supabase will
 *   succeed too, and a rejection here is the exact rejection Supabase would
 *   have surfaced as "Error sending confirmation email".
 *
 * WHY IT IS A RAW SOCKET AND NOT A LIBRARY
 *   Adding an email SDK to this repository would break the one architectural
 *   rule the whole setup rests on: nothing in OraMedha sends mail, Supabase
 *   does. A ~40-line SMTP conversation in a diagnostic script keeps that true.
 *   This file is never imported by the application.
 *
 * IT SENDS REAL EMAIL
 *   One short message per recipient, from your real quota. That is the point —
 *   a probe that did not actually send would not prove anything.
 *
 * USAGE
 *   RESEND_SMTP_PASSWORD=re_... node scripts/probe-resend-smtp.mjs \
 *     --from "OraMedha <onboarding@resend.dev>" \
 *     --to you@example.com \
 *     --to someone-else@example.com
 *
 *   Give it TWO recipients to answer the question that matters: your own
 *   Resend account address (expected to succeed) and an unrelated external
 *   address (expected to be refused unless a domain is verified). The exit code
 *   is 0 only if every recipient was accepted.
 *
 * The API key is read from the environment, never from a file in this repo,
 * and never printed.
 */

import { connect } from "node:tls";
import { Socket } from "node:net";

const HOST = "smtp.resend.com";
const PORT = 587;
const USER = "resend";

// ── Arguments ────────────────────────────────────────────────────────────────

function argValues(name) {
  const out = [];
  const argv = process.argv;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === `--${name}`) out.push(argv[i + 1]);
    else if (argv[i].startsWith(`--${name}=`)) out.push(argv[i].slice(name.length + 3));
  }
  return out.filter(Boolean);
}

const password = process.env.RESEND_SMTP_PASSWORD;
if (!password) {
  console.error(
    "\n  Missing RESEND_SMTP_PASSWORD.\n" +
      "  A Resend API key (starts with re_): https://resend.com/api-keys\n" +
      "  It is read from the environment and never written anywhere.\n"
  );
  process.exit(1);
}

const from = argValues("from")[0] ?? "OraMedha <onboarding@resend.dev>";
const recipients = argValues("to");

if (recipients.length === 0) {
  console.error(
    "\n  No --to given.\n\n" +
      "  Pass at least one recipient, and ideally two:\n" +
      "    --to <the address your Resend account was created with>\n" +
      "    --to <any unrelated external address>\n\n" +
      "  The difference between those two results IS the answer.\n"
  );
  process.exit(1);
}

/** The bare address inside "Name <addr>" or a plain address. */
function addressOf(value) {
  const angled = /<([^>]+)>/.exec(value);
  return (angled ? angled[1] : value).trim();
}

// ── A very small SMTP client ─────────────────────────────────────────────────

/**
 * Wraps a socket in the request/response discipline SMTP actually uses:
 * every command yields one reply, and a reply may span several lines
 * ("250-STARTTLS" … "250 SIZE") until one arrives whose code is followed by a
 * space rather than a hyphen.
 */
function session(socket) {
  let buffer = "";
  let pending = null;

  socket.setEncoding("utf8");
  socket.on("data", (chunk) => {
    buffer += chunk;
    // A complete reply ends with "<code><space>...<CRLF>".
    const match = /^(?:\d{3}-[^\n]*\n)*(\d{3}) [^\n]*\r?\n$/.exec(buffer);
    if (match && pending) {
      const { resolve } = pending;
      const reply = { code: Number(match[1]), text: buffer.trim() };
      buffer = "";
      pending = null;
      resolve(reply);
    }
  });

  return {
    /** Wait for the next complete reply. */
    read: () =>
      new Promise((resolve, reject) => {
        pending = { resolve };
        socket.once("error", reject);
      }),
    /** Send a command (never logged when it carries a secret). */
    write: (line) => socket.write(`${line}\r\n`),
  };
}

/** Send a command, read the reply, and fail loudly unless the code is expected. */
async function step(io, label, command, expected, { secret = false } = {}) {
  if (command !== null) io.write(command);
  const reply = await io.read();
  const ok = expected.includes(reply.code);
  const shown = secret ? "<redacted>" : (command ?? "(banner)");
  console.log(`  ${ok ? "✓" : "✗"} ${label.padEnd(18)} ${reply.code}  ${firstLine(reply.text)}`);
  if (!ok) {
    console.log(`\n    command: ${shown}`);
    console.log(`    server : ${reply.text.replace(/\n/g, "\n             ")}\n`);
    // Carry WHERE it failed, not just that it did — "the key is wrong" and
    // "this account may not mail that person" are different problems with
    // different fixes, and a probe that conflates them is worse than none.
    const failure = new Error(`${label.trim()} failed with ${reply.code}`);
    failure.step = label.trim();
    failure.code = reply.code;
    failure.serverText = reply.text;
    throw failure;
  }
  return reply;
}

const firstLine = (text) => text.split("\n")[0].trim();

const b64 = (value) => Buffer.from(value, "utf8").toString("base64");

/**
 * Run the whole conversation for ONE recipient and report what happened.
 * A fresh connection per recipient so one rejection cannot poison the next.
 */
async function probe(recipient) {
  console.log(`\n─ ${recipient}`);

  const plain = new Socket();
  await new Promise((resolve, reject) => {
    plain.connect(PORT, HOST, resolve);
    plain.once("error", reject);
    plain.setTimeout(20_000, () => reject(new Error(`timed out connecting to ${HOST}:${PORT}`)));
  });

  let io = session(plain);
  await step(io, "greeting", null, [220]);
  await step(io, "EHLO", "EHLO dentgrow.local", [250]);
  await step(io, "STARTTLS", "STARTTLS", [220]);

  // Upgrade in place. servername is required for SNI or the handshake fails.
  const secure = connect({ socket: plain, servername: HOST });
  await new Promise((resolve, reject) => {
    secure.once("secureConnect", resolve);
    secure.once("error", reject);
  });

  io = session(secure);
  await step(io, "EHLO (TLS)", "EHLO dentgrow.local", [250]);

  await step(io, "AUTH LOGIN", "AUTH LOGIN", [334]);
  await step(io, "  username", b64(USER), [334]);
  await step(io, "  password", b64(password), [235], { secret: true });

  await step(io, "MAIL FROM", `MAIL FROM:<${addressOf(from)}>`, [250]);

  // THE ANSWER USUALLY LANDS HERE. A restricted sender is refused at RCPT TO
  // with a 5xx whose text is Resend explaining the resend.dev rule.
  await step(io, "RCPT TO", `RCPT TO:<${recipient}>`, [250, 251]);

  await step(io, "DATA", "DATA", [354]);

  const message = [
    `From: ${from}`,
    `To: ${recipient}`,
    "Subject: OraMedha SMTP probe",
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="utf-8"',
    "",
    "This is a delivery probe from the OraMedha repository.",
    "",
    "It exists to confirm which recipients this Resend account may send to",
    "over SMTP. No action is needed. Nothing was configured by this message.",
    ".",
  ].join("\r\n");

  // Some rejections only surface after the body is accepted.
  await step(io, "message body", message, [250]);

  io.write("QUIT");
  secure.end();

  console.log(`  → ACCEPTED for delivery`);
  return { recipient, accepted: true };
}

// ── Run ──────────────────────────────────────────────────────────────────────

console.log(`
  Resend SMTP delivery probe
    host   ${HOST}:${PORT} (STARTTLS)
    from   ${from}
    to     ${recipients.join(", ")}
`);

const results = [];

for (const recipient of recipients) {
  try {
    results.push(await probe(recipient));
  } catch (error) {
    console.log(`  → REFUSED — ${error.message}`);
    results.push({
      recipient,
      accepted: false,
      step: error.step ?? "connection",
      serverText: error.serverText ?? error.message,
    });
  }
}

const accepted = results.filter((r) => r.accepted);
const refused = results.filter((r) => !r.accepted);

console.log(`
──────────────────────────────────────────────────────────────────
  accepted  ${accepted.length}/${results.length}`);
for (const r of refused) console.log(`  refused   ${r.recipient}  (at ${r.step})`);

// Diagnose by WHERE it broke. Everything before MAIL FROM is about the
// connection or the key and says nothing at all about recipient policy.
const authFailed = refused.some((r) => r.step.startsWith("password"));
const recipientRefused = refused.some(
  (r) => r.step === "RCPT TO" || r.step === "message body" || r.step === "MAIL FROM"
);

if (authFailed) {
  console.log(`
  The key was rejected before any recipient was discussed, so this run says
  NOTHING about what your account may send. Check RESEND_SMTP_PASSWORD is a
  current key from https://resend.com/api-keys and run it again.`);
} else if (recipientRefused && /resend\.dev/i.test(from)) {
  console.log(`
  Refused at the recipient stage while sending from resend.dev. That is the
  documented behaviour: the shared resend.dev sender may only deliver to the
  address your Resend account was created with. It is not a misconfiguration,
  and no setting in this repository can lift it — only verifying your own
  domain at https://resend.com/domains can.

  See supabase/EMAIL.md §5.`);
} else if (recipientRefused) {
  console.log(`
  Refused at the recipient stage. With a custom sending domain this usually
  means the domain is not Verified yet in https://resend.com/domains.`);
} else if (accepted.length === results.length) {
  console.log(`
  Every recipient was accepted. If one of these was an unrelated external
  address, this account is NOT limited to the resend.dev owner-only rule and
  Supabase can send to real users through it.`);
}

console.log();
process.exit(refused.length === 0 ? 0 : 1);
