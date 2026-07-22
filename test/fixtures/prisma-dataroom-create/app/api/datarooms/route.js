import prisma from "../../../lib/prisma.js";

export async function POST() {
  const dataroom = await prisma.dataroom.create({
    data: { name: "Room", teamId: "t1" },
  });
  return Response.json(dataroom);
}
