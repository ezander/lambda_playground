import { describe, it, expect } from "vitest";
import { Var, Abs, App, Subst } from "./ast";
import { prettyPrint } from "./pretty";

describe("prettyPrint — backtick quoting", () => {
  it("does not quote plain alphanumeric names", () => {
    expect(prettyPrint(Var("x"))).toBe("x");
    expect(prettyPrint(Var("foo"))).toBe("foo");
    expect(prettyPrint(Var("x1"))).toBe("x1");
  });

  it("does not quote operator-style names", () => {
    expect(prettyPrint(Var("+"))).toBe("+");
    expect(prettyPrint(Var("+3"))).toBe("+3");
    expect(prettyPrint(Var("5-"))).toBe("5-");
  });

  it("does not quote names with apostrophe", () => {
    expect(prettyPrint(Var("x'"))).toBe("x'");
  });

  it("quotes names containing spaces", () => {
    expect(prettyPrint(Var("a b"))).toBe("`a b`");
  });

  it("quotes names with leading or trailing spaces", () => {
    expect(prettyPrint(Var("a "))).toBe("`a `");
    expect(prettyPrint(Var(" a"))).toBe("` a`");
  });

  it("quotes reserved words used as names", () => {
    expect(prettyPrint(Var("α"))).toBe("`α`");
    expect(prettyPrint(Var("β"))).toBe("`β`");
  });

  it("quotes reserved Greek letter η", () => {
    expect(prettyPrint(Var("η"))).toBe("`η`");
  });

  it("quotes λ when used as a variable name", () => {
    expect(prettyPrint(Var("λ"))).toBe("`λ`");
  });

  it("quotes π when used as a variable name", () => {
    expect(prettyPrint(Var("π"))).toBe("`π`");
  });

});

describe("prettyPrint — structure", () => {
  it("prints a variable", () => {
    expect(prettyPrint(Var("x"))).toBe("x");
  });

  it("compresses multi-param lambdas", () => {
    expect(prettyPrint(Abs("x", Abs("y", Var("x"))))).toBe("λx y. x");
  });

  it("parenthesises lambda in argument position", () => {
    expect(prettyPrint(App(Var("f"), Abs("x", Var("x"))))).toBe("f (λx. x)");
  });

  it("does not parenthesise application in function position", () => {
    expect(prettyPrint(App(App(Var("f"), Var("x")), Var("y")))).toBe("f x y");
  });

  it("parenthesises application in argument position", () => {
    expect(prettyPrint(App(Var("f"), App(Var("g"), Var("x"))))).toBe("f (g x)");
  });

  it("compresses triple-param lambda", () => {
    expect(prettyPrint(Abs("x", Abs("y", Abs("z", Var("x")))))).toBe("λx y z. x");
  });

  it("prints Subst with a complex arg", () => {
    // x[y:=f z]
    expect(prettyPrint(Subst(Var("x"), "y", App(Var("f"), Var("z"))))).toBe("x[y:=f z]");
  });

  it("prints Subst with a lambda arg", () => {
    // x[y:=λz. z]
    expect(prettyPrint(Subst(Var("x"), "y", Abs("z", Var("z"))))).toBe("x[y:=λz. z]");
  });
});
