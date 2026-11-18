import { describe, expect, it } from "vitest";
import { isAutomatedMail, senderAddress } from "../hq-mail";

describe("HQ mail: people first", () => {
  it("folds bot, no-reply and newsletter senders", () => {
    expect(isAutomatedMail('"vercel[bot]" <notifications@github.com>', "Re: [Git-Dann/docs-by-gitwork] Board")).toBe(true);
    expect(isAutomatedMail("Fasthosts <noreply@fasthosts.co.uk>", "Verification of login")).toBe(true);
    expect(isAutomatedMail('"CodePen" <hello@codepen.io>', "CSS Physics")).toBe(true);
    expect(isAutomatedMail("Designer Boss <newsletter@designerboss.com>", "Your designer brain")).toBe(true);
    // A bot sender with an ordinary subject: the sender alone decides it.
    expect(isAutomatedMail('"dependabot[bot]" <support@githubapp.com>', "Bump zod")).toBe(true);
  });

  it("keeps mail from a person, even with a business domain", () => {
    expect(isAutomatedMail('"Luke McFarland" <luke.mcfarland@bigwedgegolf.com>', "Release notes")).toBe(false);
    expect(isAutomatedMail("harry@gitwork.co.uk", "Lunch?")).toBe(false);
    // "bot" inside a word is not a bot.
    expect(isAutomatedMail('"Abbott Lee" <abbott@example.com>', "Quote")).toBe(false);
  });

  it("reads the address out of a display form", () => {
    expect(senderAddress('"A" <A@B.com>')).toBe("a@b.com");
    expect(senderAddress("x@y.z")).toBe("x@y.z");
  });
});
