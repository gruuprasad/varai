export default async function handle(req, res) {
  if (req.method === "GET") {
    return res.status(200).json([]);
  }
  if (req.method === "POST") {
    return res.status(201).json({ ok: true });
  }
  return res.status(405).end();
}
