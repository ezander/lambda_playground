import churchBooleans  from "./sys/Church Booleans.txt?raw";
import churchNumerals  from "./sys/Church Numerals.txt?raw";
import combinators     from "./sys/Combinators.txt?raw";
import pairs           from "./sys/Pairs.txt?raw";
import lists           from "./sys/Lists.txt?raw";
import yCombinator     from "./sys/Y Combinator.txt?raw";

export const SYS_INCLUDES: Record<string, string> = {
  "sys/Church Booleans": churchBooleans,
  "sys/Church Numerals": churchNumerals,
  "sys/Combinators":     combinators,
  "sys/Pairs":           pairs,
  "sys/Lists":           lists,
  "sys/Y Combinator":    yCombinator,
};
