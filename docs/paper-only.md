# Paper-Only Design

This project starts as a paper-trading scanner skeleton. Scanner modules can produce structured opportunity data, but they must not place orders.

All execution behavior must pass through `executeOrPaper`, which records paper-only execution results in v1.
