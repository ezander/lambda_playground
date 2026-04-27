# Grammar

Auto-generated from the Chevrotain parser by `npm run gen:grammar`.
Do not edit by hand — change the parser in `src/parser/grammar.ts` and re-run the script.

```
program            ::=  programItem*
programItem        ::=  statementSep | statement statementSep | directiveLine
statementSep       ::=  '\n' | ';'
statement          ::=  printStmt | equivStmt | nequivStmt | evalStmt | definition | term
directiveLine      ::=  ':…' '\n'
printStmt          ::=  ('π' | ':print') comprehensionSpec? term
equivStmt          ::=  ('≡' | ':assert') comprehensionSpec? atom atom
nequivStmt         ::=  ('≢' | ':assert-not') comprehensionSpec? atom atom
evalStmt           ::=  ':eval' term
definition         ::=  identifier binder* (':=' | '::=') term
comprehensionSpec  ::=  '[' compBinding (',' compBinding)* ']'
compBinding        ::=  identifier ':=' '{' term (',' term)* '}'
term               ::=  abstraction | application
application        ::=  atom (atom | abstraction)*
atom               ::=  (identifier | '(' term ')') subst*
subst              ::=  '[' binder ':=' term ']'
abstraction        ::=  'λ' binder+ '.' term
binder             ::=  identifier | strictBinder
identifier         ::=  plainIdent | backtickIdent
plainIdent         ::=  (alnum | '_' | "'" | greek | op-sym)+
backtickIdent      ::=  '`' [^`\n]+ '`'
strictBinder       ::=  'β' identifier    -- β fused to name, no whitespace (call-by-value binder)
```
