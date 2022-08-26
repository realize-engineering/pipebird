// TODO(timothygoltser): Fix types
declare module "pgsql-parser" {
  type Value =
    | {
        String: {
          str: string;
        };
      }
    | { Integer: { ival: number } };

  type Target = {
    ResTarget: {
      name?: string;
      val: {
        ColumnRef: {
          fields: Value[];
        };
      };
    };
  };

  type SelectStmt = {
    targetList: Target[];
    fromClause: {
      RangeSubselect: {
        subquery: {
          SelectStmt: SelectStmt;
        };
        alias: { aliasname: string };
      };
    }[];
    whereClause: {
      BoolExpr: {
        boolop: "AND_EXPR";
        args: [
          {
            A_Expr: {
              kind: "AEXPR_OP";
              name: [{ String: { str: "=" } }];
              lexpr: {
                ColumnRef: {
                  fields: Value[];
                };
              };
              rexpr: {
                A_Const: {
                  val: Value;
                };
              };
            };
          },
          {
            A_Expr: {
              kind: "AEXPR_OP";
              name: [{ String: { str: ">" } }];
              lexpr: {
                TypeCast: {
                  arg: {
                    TypeCast: {
                      arg: {
                        ColumnRef: {
                          fields: Value[];
                        };
                      };
                      typeName: {
                        names: Value[];
                        typemod: -1;
                      };
                    };
                  };
                  typeName: {
                    names: [
                      { String: { str: "pg_catalog" } },
                      { String: { str: "int8" } },
                    ];
                    typemod: -1;
                  };
                };
              };
              rexpr: {
                A_Const: {
                  val: { Integer: { ival: number } };
                };
              };
            };
          },
        ];
      };
    };
    limitOption: "LIMIT_OPTION_DEFAULT";
    op: "SETOP_NONE";
  };

  type RawStmt = {
    stmt:
      | { SelectStmt: SelectStmt }
      | { InsertStmt: InsertStmt }
      | { DeleteStmt: DeleteStmt }
      | { UpdateStmt: UpdateStmt };
    stmt_len?: number;
    stmt_location: number;
  };

  type ParseTree = { RawStmt: RawStmt }[];

  export function parse(sql: string): ParseTree;
  export function deparse(parseTree: ParseTree): string;
}
