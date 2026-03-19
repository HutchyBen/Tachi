import { ALL_PERMISSIONS } from "#constants/permissions.js";
import z from "zod";

export const zodPermission = z.enum(Object.keys(ALL_PERMISSIONS));
