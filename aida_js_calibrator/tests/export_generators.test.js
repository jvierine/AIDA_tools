const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadExportGenerators() {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "export_generators.js"), "utf8");
    const context = {
        window: {},
        Number,
    };
    vm.createContext(context);
    vm.runInContext(source, context, {filename: "export_generators.js"});
    return context.window.AidaExportGenerators;
}

const ExportGenerators = loadExportGenerators();
const LANGUAGES = ["python", "julia", "c", "matlab"];
const MODELS = [1, 2, 3, 4, 5, 12, ExportGenerators.BROWN_CONRADY_OPTMOD];

function contextForOptmod(optmod) {
    const optpar = optmod === ExportGenerators.BROWN_CONRADY_OPTMOD ?
        [0.9, 1.2, 1.0, -2.0, 3.0, 0.01, -0.02, 0.02, -0.005, 0.0004, 0.0001, -0.0002] :
        [0.9, 1.2, 1.0, -2.0, 3.0, 0.01, -0.02, optmod === 12 ? -0.25 : 0.7];
    return {optpar, optmod, width: 1920, height: 1080};
}

function assertCleanGeneratedText(text, language, optmod) {
    assert.equal(typeof text, "string");
    assert.ok(text.length > 100, `${language} optmod ${optmod} export should be non-trivial`);
    assert.ok(!text.includes("undefined"), `${language} optmod ${optmod} export contains undefined`);
    assert.ok(!text.includes("[object Object]"), `${language} optmod ${optmod} export contains object stringification`);
    assert.ok(text.includes(String(optmod)), `${language} optmod ${optmod} export should mention optmod`);
}

test("optpar array generators support every language and model", () => {
    for (const optmod of MODELS) {
        const context = contextForOptmod(optmod);
        for (const language of LANGUAGES) {
            const text = ExportGenerators.optparArrayText(context, language);
            assert.equal(typeof text, "string");
            assert.ok(!text.includes("undefined"), `${language} optmod ${optmod} optpar contains undefined`);
            assert.ok(!text.includes("[object Object]"), `${language} optmod ${optmod} optpar contains object stringification`);
            if (language === "c") {
                assert.match(text, /^static const double optpar\[\d+\] = \{/);
                assert.ok(text.endsWith("};"));
            } else if (language === "matlab") {
                assert.match(text, /^optpar = \[/);
                assert.ok(text.endsWith("];"));
            } else {
                assert.match(text, /^optpar = \[/);
                assert.ok(text.endsWith("]"));
            }
        }
    }
});

test("mapper code generators support every language and model", () => {
    for (const optmod of MODELS) {
        const context = contextForOptmod(optmod);
        for (const language of LANGUAGES) {
            const text = ExportGenerators.mapperCode(context, language);
            assertCleanGeneratedText(text, language, optmod);
            if (language === "python") {
                assert.match(text, /def az_el_to_image/);
                assert.match(text, /def image_to_az_el/);
            } else if (language === "julia") {
                assert.match(text, /function az_el_to_image/);
                assert.doesNotMatch(text, /function image_to_az_el/);
            } else if (language === "c") {
                assert.match(text, /void aida_az_el_to_image/);
                assert.match(text, /#include <math.h>/);
            } else if (language === "matlab") {
                assert.match(text, /function \[x, y\] = az_el_to_image/);
            }
        }
    }
});

test("python mapper exports are syntactically valid for every model", () => {
    const python = process.env.PYTHON || "/opt/miniconda3/bin/python";
    for (const optmod of MODELS) {
        const text = ExportGenerators.mapperCode(contextForOptmod(optmod), "python");
        const result = childProcess.spawnSync(
            python,
            ["-c", "import ast, sys; ast.parse(sys.stdin.read())"],
            {input: text, encoding: "utf8"},
        );
        assert.equal(result.status, 0, result.stderr || result.stdout);
    }
});
