// Fixture stand-in for @/lib/prisma — not executed by Varai.
const prisma = {
  dataroom: { create() {}, findUnique() {} },
  document: { create() {}, update() {}, findUnique() {} },
  userTeam: { findUnique() {} },
};
export default prisma;
