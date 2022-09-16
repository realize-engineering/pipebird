-- CreateTable
CREATE TABLE "StagingBucket" (
    "bucketName" TEXT NOT NULL,
    "bucketRegion" TEXT,
    "destinationId" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "StagingBucket_destinationId_key" ON "StagingBucket"("destinationId");

-- AddForeignKey
ALTER TABLE "StagingBucket" ADD CONSTRAINT "StagingBucket_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
