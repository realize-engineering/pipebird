import { z } from "zod";
class EnumValidator<T extends string> {
  public validator: z.ZodEnum<[T, ...T[]]>;

  constructor(validator: z.ZodEnum<[T, ...T[]]>) {
    this.validator = validator;
  }

  isValid = (item: any): boolean => this.validator.safeParse(item).success;

  inSet = (item: T, set: T[]): boolean => set.includes(item);

  cast = (item: any): T | "UNKNOWN" => {
    if (this.isValid(item)) {
      return item as T;
    }
    return "UNKNOWN";
  };
}

export { EnumValidator };
