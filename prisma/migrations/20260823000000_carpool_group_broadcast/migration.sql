-- CoordinationGroup gains a broadcast destination, so a carpool rota can be
-- posted to the group's own thread instead of fanned out to each parent.
ALTER TABLE "CoordinationGroup" ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "CoordinationGroup" ADD COLUMN "channelAddress" TEXT;
ALTER TABLE "CoordinationGroup" ADD COLUMN "broadcastEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Which half of the school run an activity is, for group-facing labelling.
ALTER TABLE "Activity" ADD COLUMN "carpoolRole" TEXT;
