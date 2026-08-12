#!/usr/bin/env node
/**
 * Chequeo de tipos de las funciones AUTOCONTENIDAS, una por una.
 *
 * tsconfig.functions.json solo puede incluir los entry.ts que tienen algun
 * import: eso los convierte en modulos ES y les da su propio ambito. Los
 * autocontenidos —los que no importan nada, porque el soporte de imports
 * relativos en el deploy de Base44 no esta confirmado— son scripts globales
 * para TypeScript, asi que meter dos en el mismo programa hace chocar cada
 * `const TOKEN` contra el del otro archivo.
 *
 * La salida facil era dejarlos sin revisar, que es como estaba importarInventario:
 * un error de tipos ahi no aparecia hasta el deploy. Compilar cada uno en su
 * propio programa cuesta unos segundos y los cubre a todos.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FUNCIONES = [
  'base44/functions/importarInventario/entry.ts',
  'base44/functions/codigosMensuales/entry.ts',
  'base44/functions/mailchimpCampana/entry.ts',
];

const OPCIONES = {
  target: 'ES2022',
  module: 'ESNext',
  moduleResolution: 'bundler',
  allowImportingTsExtensions: true,
  noEmit: true,
  skipLibCheck: true,
  strict: false,
  noUnusedLocals: true,
  types: [],
};

const TSC = join(process.cwd(), 'node_modules', 'typescript', 'bin', 'tsc');
const dir = mkdtempSync(join(tmpdir(), 'chk-'));
let fallos = 0;

try {
  for (const fn of FUNCIONES) {
    const cfg = join(dir, 'tsconfig.json');
    writeFileSync(cfg, JSON.stringify({
      compilerOptions: OPCIONES,
      // Se compila junto a deno.d.ts para que Deno.serve y Deno.env existan.
      files: [
        join(process.cwd(), 'base44/functions/deno.d.ts'),
        join(process.cwd(), fn),
      ],
    }));

    try {
      // Se invoca el tsc de node_modules con node, no `npx ... shell:true`:
      // pasar argumentos por shell los concatena sin escapar y ademas obliga a
      // ramificar por plataforma.
      execFileSync(process.execPath, [TSC, '-p', cfg], { stdio: 'pipe' });
      console.log(`OK   ${fn}`);
    } catch (e) {
      fallos++;
      console.error(`FALLA ${fn}`);
      console.error(String(e.stdout || e.message).trim());
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (fallos) {
  console.error(`\n${fallos} funcion(es) con errores de tipo.`);
  process.exit(1);
}
console.log('Funciones autocontenidas: sin errores de tipo.');
