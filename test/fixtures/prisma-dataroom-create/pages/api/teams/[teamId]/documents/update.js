import prisma from "../../../../../lib/prisma.js";

export default async function handle(req, res) {
  if (req.method === "POST") {
    const teamAccess = await prisma.userTeam.findUnique({
      where: { id: "access" },
    });
    if (!teamAccess) {
      return res.status(401).end("Unauthorized");
    }
    await prisma.document.update({
      where: { id: req.body.documentId },
      data: { name: req.body.name },
    });
    return res.status(201).json({ message: "updated" });
  }
  res.setHeader("Allow", ["POST"]);
  return res.status(405).end("Method Not Allowed");
}
