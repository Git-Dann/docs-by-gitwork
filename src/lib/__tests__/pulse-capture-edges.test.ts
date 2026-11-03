// @vitest-environment node
import { describe, expect, it } from "vitest";
import { captureFieldErrors, isValidEmail, parseCapture, suggestEmail } from "@/lib/pulse-capture";

const ok = { name: "Sam Okafor", business: "Northwind Studio", email: "sam@northwind.co.uk", termsAccepted: true };

describe("email addresses", () => {
  it.each([
    "sam@northwind.co.uk", "SAM@Northwind.CO.UK", "first.last@example.com", "dan+pulse@gitwork.co.uk",
    "o'neill@example.ie", "a_b-c@sub.domain.example.org", "x@example.museum", "user@xn--bcher-kva.example",
    "  sam@northwind.co.uk  ",
  ])("accepts %s", (e) => expect(isValidEmail(e)).toBe(true));

  it.each([
    "", "sam", "sam@", "@northwind.com", "sam@northwind", "sam@northwind.", "sam@.com", "sam@northwind..com",
    ".sam@northwind.com", "sam.@northwind.com", "sa..m@northwind.com", "sam@@northwind.com", "sam@north@wind.com",
    "sam @northwind.com", "sam@north wind.com", "sam@-northwind.com", "sam@northwind-.com", "sam@northwind.c",
    "sam@northwind.c0m", "sam@192.168.0.1", "\"sam\"@northwind.com", "Sam <sam@northwind.com>",
    "sam@northwind.com\nBcc: victim@example.com", "sam@nörthwind.com", `${"a".repeat(65)}@example.com`,
    `sam@${"a".repeat(64)}.com`, `sam@${"abcdefghij.".repeat(25)}com`,
  ])("refuses %j", (e) => expect(isValidEmail(e)).toBe(false));

  it("is lower-cased and trimmed before it is stored", () => {
    const r = parseCapture({ ...ok, email: "  Sam@Northwind.CO.UK " });
    expect(r.ok && r.value.email).toBe("sam@northwind.co.uk");
  });

  it("suggests the provider someone meant, without changing what they typed", () => {
    expect(suggestEmail("sam@gmial.com")).toBe("sam@gmail.com");
    expect(suggestEmail("sam@hotmail.co")).toBe("sam@hotmail.co.uk");
    expect(suggestEmail("sam@gmail.com")).toBeNull();
    expect(suggestEmail("sam@northwind.co.uk")).toBeNull();
    expect(suggestEmail("nonsense")).toBeNull();
  });
});

describe("the name, which opens the email we send", () => {
  it.each(["Sam", "Siân Llewellyn", "Zoë O'Brien-Smith", "J. R. R. Tolkien", "李雷", "José María", "Dr. Ada Lovelace"])(
    "accepts %s", (name) => expect(parseCapture({ ...ok, name }).ok).toBe(true),
  );

  it.each([
    ["", "Enter your name."],
    ["   ", "Enter your name."],
    ["!!!", "in letters"],
    ["https://phish.example", "without a web address"],
    ["Win a prize at www.example.com", "without a web address"],
    ["Visit phish.ru now", "without a web address"],
    ["claim at bit.ly", "without a web address"],
    ["sam@northwind.com", "your email address below"],
    ["<script>alert(1)</script>", "without symbols"],
    ["Call 07700900123", "without numbers"],
    ["x".repeat(81), "too long"],
  ])("refuses %j", (name, why) => {
    const r = parseCapture({ ...ok, name });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.field).toBe("name");
      expect(r.error).toContain(why);
    }
  });

  it("drops invisible and direction-reversing characters, and folds newlines", () => {
    const r = parseCapture({ ...ok, name: "Sam​ ‮Okafor\nSmith\u0000" });
    expect(r.ok && r.value.name).toBe("Sam Okafor Smith");
  });
});

describe("the business name", () => {
  it.each(["Northwind Studio", "Monday.com", "AT&T", "Smith & Sons Ltd", "3M", "Acme (UK) Ltd", "O'Reilly Media"])(
    "accepts %s", (business) => expect(parseCapture({ ...ok, business }).ok).toBe(true),
  );

  it.each(["", "https://northwind.com", "www.northwind.com", "info@northwind.com", "<b>Northwind</b>", "!!!", "x".repeat(121)])(
    "refuses %j", (business) => {
      const r = parseCapture({ ...ok, business });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.field).toBe("business");
    },
  );
});

describe("the terms", () => {
  it.each([undefined, false, "true", "yes", 1, null])("are not agreed by %j", (termsAccepted) => {
    const r = parseCapture({ ...ok, termsAccepted });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe("terms");
  });
});

describe("the form's field-by-field errors", () => {
  it("lists every problem at once, and none for a valid form", () => {
    expect(Object.keys(captureFieldErrors({ name: "", business: "", email: "x", termsAccepted: false })).sort())
      .toEqual(["business", "email", "name", "terms"]);
    expect(captureFieldErrors(ok)).toEqual({});
  });

  it("ignores values that aren't strings, rather than throwing", () => {
    expect(parseCapture({ name: 42, business: { a: 1 }, email: ["a@b.co"], termsAccepted: true }).ok).toBe(false);
  });
});

import { honeypotTripped } from "@/lib/pulse-capture";

describe("the honeypot", () => {
  it("is not tripped when empty, or when autofill copied a real field into it", () => {
    expect(honeypotTripped("", ["a"])).toBe(false);
    expect(honeypotTripped(undefined, ["a"])).toBe(false);
    expect(honeypotTripped("  Gitwork Group Ltd ", ["Harry Brown", "gitwork group ltd", "h@b.co"])).toBe(false);
    expect(honeypotTripped("harry@b.co", ["Harry", "Acme", "Harry@B.co"])).toBe(false);
  });

  it("is tripped by anything else", () => {
    expect(honeypotTripped("buy now", ["Harry", "Acme", "h@b.co"])).toBe(true);
    expect(honeypotTripped("x", [])).toBe(true);
  });
});
