-- E13-04: the shape gallery. See the comment on `LibraryShape` in schema.prisma.

-- CreateTable
CREATE TABLE "library_shapes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "occasion" TEXT,
    "art" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "library_shapes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "library_shapes_status_group_idx" ON "library_shapes"("status", "group");
