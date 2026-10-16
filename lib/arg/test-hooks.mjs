// lets node --test load the app's files the way next does
import { registerHooks } from "node:module";

const root = new URL("../../", import.meta.url);

registerHooks({
    resolve(specifier, context, next) {
        if (specifier === "server-only") {
            return next("next/dist/compiled/server-only/empty.js", context);
        }
        // the tsconfig "@/*" alias
        if (specifier.startsWith("@/")) {
            return next(new URL(`${specifier.slice(2)}.ts`, root).href, context);
        }
        // our own files only, packages resolve their requires themselves
        const ours = !context.parentURL?.includes("/node_modules/");
        if (ours && specifier.startsWith(".") && !/\.\w+$/.test(specifier)) {
            return next(`${specifier}.ts`, context);
        }
        return next(specifier, context);
    },
});
