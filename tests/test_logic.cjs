
const fs = require('fs');
const path = require('path');

// Mock types
const Op = {
    PUSH_B: 0x01,
    PUSH_W: 0x02,
    PUSH_D: 0x03,
    LEA_L_B: 0x14,
    LEA_L_W: 0x15,
    LEA_L_D: 0x16,
    STORE: 0x35,
    CALL: 0x39,
    EXIT: 0x3f,
};

// We don't need the full compiler here, let's just test the tokenization and parsing logic snippets
// Or better, let's try to run node on compiler.ts if we can transpile it with a simple regex for imports

console.log("Testing array declaration with []...");

function mockParse(src) {
    let pos = 0;
    function peekToken() {
        let p = pos;
        while (p < src.length && /\s/.test(src[p])) p++;
        if (p >= src.length) return "";
        let start = p;
        const special = "(){}[],;=+-*/%><!&|^~";
        if (special.includes(src[p])) {
            return src[p];
        }
        while (p < src.length && !/\s/.test(src[p]) && !special.includes(src[p])) p++;
        return src.substring(start, p);
    }

    function parseToken() {
        let token = peekToken();
        pos += src.indexOf(token, pos) - pos + token.length;
        return token;
    }

    function match(t) {
        if (peekToken() === t) {
            parseToken();
            return true;
        }
        return false;
    }

    // Snippet from parseStatement
    let token = parseToken(); // char
    let name = parseToken(); // testStr
    let size = 1;
    if (match('[')) {
        if (peekToken() === ']') {
            parseToken();
            size = 0;
            console.log("Found empty brackets, size set to 0");
        } else {
            size = parseInt(parseToken());
            match(']');
        }
    }
    if (match('=')) {
        let it = peekToken();
        if (it.startsWith('"')) {
            let str = it.substring(1, it.length - 1);
            if (size === 0) size = str.length + 1;
            console.log("Inferred size:", size);
        }
    }
    console.log("Final size for", name, ":", size);
}

mockParse('char testStr[] = "Hello";');
