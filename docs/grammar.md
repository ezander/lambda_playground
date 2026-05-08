# Grammar

Auto-generated from the Chevrotain parser by `npm run gen:grammar`.
Do not edit by hand — change the parser in `src/parser/grammar.ts` and re-run the script.

```
program            ::=  programItem*
programItem        ::=  statementSep | statement statementSep | directiveLine
statementSep       ::=  '\n' | ';'
statement          ::=  printStmt | printListStmt | assertStmt | evalStmt | definition | term
directiveLine      ::=  ':…' '\n'
printStmt          ::=  ':print' comprehensionSpec? term
assertStmt         ::=  ':assert' comprehensionSpec? term ('≡' | '≢') term
evalStmt           ::=  ':eval' term
printListStmt      ::=  CmdPrintList printListOpts? term
printListOpts      ::=  '[' printListOpt (',' printListOpt)* ']'
printListOpt       ::=  identifier ':=' term
definition         ::=  identifier binder* (':=' | '::=') term
comprehensionSpec  ::=  '[' compBinding (',' compBinding)* ']'
compBinding        ::=  identifier ':=' '{' term (',' term)* '}'
term               ::=  abstraction | application
application        ::=  atom (atom | abstraction)*
atom               ::=  (identifier | '(' term ')') subst*
subst              ::=  '[' binder ':=' term ']'
abstraction        ::=  'λ' binder+ '.' term
binder             ::=  identifier | eagerBinder
identifier         ::=  plainIdent | backtickIdent
plainIdent         ::=  (alnum | '_' | "'" | greek | op-sym)+
backtickIdent      ::=  '`' [^`\n]+ '`'
eagerBinder        ::=  'β' identifier    -- β fused to name, no whitespace (call-by-value binder)
```
