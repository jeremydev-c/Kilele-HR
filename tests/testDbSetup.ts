/** Imported first by every *.db.test.ts: run against kilele_hr_test, never the demo database. */
import { switchToTestDatabase } from "@/lib/testDb";

switchToTestDatabase();
process.env.EMAIL_DELIVERY = "off"; // tests write emails to the log but never send them
