module.exports = {
    "env": {
        "browser": true,
        "commonjs": true
    },
    "extends": "eslint:recommended",
    "rules": {
        "accessor-pairs": "error",
        "array-bracket-spacing": [
            "error",
            "never"
        ],
        "array-callback-return": "error",
        "arrow-body-style": "error",
        "arrow-parens": "error",
        "arrow-spacing": "error",
        "block-scoped-var": "error",
        "block-spacing": "off",
        "brace-style": "off",
        "callback-return": "off",
        "camelcase": "off",
        "comma-dangle": [
            "error",
            "only-multiline"
        ],
        "comma-spacing": "off",
        "comma-style": [
            "error",
            "last"
        ],
        "complexity": "error",
        "computed-property-spacing": [
            "error",
            "never"
        ],
        "consistent-return": "off",
        "consistent-this": "error",
        "curly": "off",
        "default-case": "error",
        "dot-location": [
            "error",
            "property"
        ],
        "dot-notation": [
            "error",
            {
                "allowKeywords": true
            }
        ],
        "eol-last": "off",
        "eqeqeq": "off",
        "func-names": "off",
        "func-style": "off",
        "generator-star-spacing": "error",
        "global-require": "error",
        "guard-for-in": "off",
        "handle-callback-err": "error",
        "id-blacklist": "error",
        "id-length": "off",
        "id-match": "error",
        "indent": "off",
        "init-declarations": "off",
        "jsx-quotes": "error",
        "key-spacing": "off",
        "keyword-spacing": "off",
        "linebreak-style": [
            "error",
            "windows"
        ],
        "lines-around-comment": "off",
        "max-depth": "off",
        "max-len": "off",
        "max-nested-callbacks": "error",
        "max-params": "off",
        "max-statements": "off",
        "max-statements-per-line": "off",
        "new-parens": "error",
        "newline-after-var": "off",
        "newline-before-return": "off",
        "newline-per-chained-call": "error",
        "no-alert": "error",
        "no-array-constructor": "error",
        "no-bitwise": "off",
        "no-caller": "error",
        "no-catch-shadow": "error",
        "no-confusing-arrow": "error",
        "no-continue": "error",
        "no-div-regex": "error",
        "no-duplicate-imports": "error",
        "no-else-return": "off",
        "no-empty-function": "off",
        "no-eq-null": "error",
        "no-eval": "error",
        "no-extend-native": "error",
        "no-extra-bind": "error",
        "no-extra-label": "error",
        "no-extra-parens": "off",
        "no-floating-decimal": "error",
        "no-implicit-globals": "off",
        "no-implied-eval": "error",
        "no-inline-comments": "off",
        "no-inner-declarations": [
            "error",
            "functions"
        ],
        "no-invalid-this": "error",
        "no-iterator": "error",
        "no-label-var": "error",
        "no-labels": "error",
        "no-lone-blocks": "error",
        "no-lonely-if": "off",
        "no-loop-func": "error",
        "no-magic-numbers": "off",
        "no-mixed-requires": "error",
        "no-multi-spaces": "off",
        "no-multi-str": "error",
        "no-multiple-empty-lines": "off",
        "no-native-reassign": "error",
        "no-negated-condition": "off",
        "no-nested-ternary": "off",
        "no-new": "error",
        "no-new-func": "error",
        "no-new-object": "error",
        "no-new-require": "error",
        "no-new-wrappers": "error",
        "no-octal-escape": "error",
        "no-param-reassign": "off",
        "no-path-concat": "error",
        "no-plusplus": [
            "error",
            {
                "allowForLoopAfterthoughts": true
            }
        ],
        "no-process-env": "error",
        "no-process-exit": "error",
        "no-proto": "error",
        "no-prototype-builtins": "off",
        "no-restricted-globals": "error",
        "no-restricted-imports": "error",
        "no-restricted-modules": "error",
        "no-restricted-syntax": "error",
        "no-return-assign": "error",
        "no-script-url": "error",
        "no-self-compare": "error",
        "no-sequences": "error",
        "no-shadow": "off",
        "no-shadow-restricted-names": "error",
        "no-spaced-func": "error",
        "no-sync": "error",
        "no-ternary": "off",
        "no-throw-literal": "error",
        "no-trailing-spaces": "off",
        "no-undef-init": "error",
        "no-undefined": "off",
        "no-underscore-dangle": "off",
        "no-unmodified-loop-condition": "error",
        "no-unneeded-ternary": "error",
        "no-unsafe-finally": "error",
        "no-unused-expressions": "error",
        "no-use-before-define": "off",
        "no-useless-call": "error",
        "no-useless-computed-key": "error",
        "no-useless-concat": "error",
        "no-useless-constructor": "error",
        "no-useless-escape": "error",
        "no-useless-rename": "error",
        "no-var": "off",
        "no-void": "error",
        "no-warning-comments": "off",
        "no-whitespace-before-property": "error",
        "no-with": "error",
        "object-curly-spacing": [
            "error",
            "never"
        ],
        "object-property-newline": [
            "error",
            {
                "allowMultiplePropertiesPerLine": true
            }
        ],
        "object-shorthand": "off",
        "one-var": "off",
        "one-var-declaration-per-line": [
            "error",
            "initializations"
        ],
        "operator-assignment": "off",
        "operator-linebreak": "off",
        "padded-blocks": "off",
        "prefer-arrow-callback": "off",
        "prefer-const": "error",
        "prefer-reflect": "off",
        "prefer-rest-params": "off",
        "prefer-spread": "off",
        "prefer-template": "off",
        "quote-props": "off",
        "quotes": "off",
        "radix": "error",
        "require-jsdoc": "off",
        "require-yield": "error",
        "semi": "error",
        "semi-spacing": [
            "error",
            {
                "after": true,
                "before": false
            }
        ],
        "sort-imports": "error",
        "sort-vars": "off",
        "space-before-blocks": "off",
        "space-before-function-paren": "off",
        "space-in-parens": "off",
        "space-infix-ops": "off",
        "space-unary-ops": "off",
        "spaced-comment": "off",
        "strict": "off",
        "template-curly-spacing": "error",
        "unicode-bom": [
            "error",
            "never"
        ],
        "valid-jsdoc": "off",
        "vars-on-top": "off",
        "wrap-iife": [
            "error",
            "any"
        ],
        "wrap-regex": "error",
        "yield-star-spacing": "error",
        "yoda": [
            "error",
            "never"
        ]
    }
};