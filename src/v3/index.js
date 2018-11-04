import * as svelte from 'svelte';
import MagicString from 'magic-string';
import { walk, childKeys } from 'estree-walker';

// We need to tell estree-walker that it should always
// look for an `else` block, otherwise it might get
// the wrong idea about the shape of each/if blocks
childKeys.EachBlock = childKeys.IfBlock = ['children', 'else'];
childKeys.Attribute = ['value'];

function error(message, pos) {
	const e = new Error(message);
	e.pos = pos;

	// TODO add code frame

	throw e;
}

export function upgradeTemplate(source) {
	const code = new MagicString(source);
	const result = svelte.compile(source, {
		generate: false
	});

	const indent = code.getIndentString();

	const properties = {};
	const methods = {};

	if (result.ast.js) {
		const defaultValues = new Map();
		result.stats.props.forEach(prop => {
			defaultValues.set(prop, undefined);
		});

		const defaultExport = result.ast.js.content.body.find(node => node.type === 'ExportDefaultDeclaration');
		if (defaultExport) {
			const blocks = [];

			// TODO set up indentExclusionRanges

			defaultExport.declaration.properties.forEach(prop => {
				switch (prop.key.name) {
					case 'data':
						handleData(prop.value, defaultValues, code, blocks);
						break;

					default:
						throw new Error(`Not implemented: ${prop.key.name}`);
				}
			});

			let props = [];
			for (const [key, value] of defaultValues) {
				props.push(`export let ${key} = ${value};`)
			}

			blocks.push(props.join('\n'));

			// if (properties.computed) {
			// 	properties.computed.properties.forEach(prop => {
			// 		const { params } = prop.value;

			// 		if (prop.value.type === 'FunctionExpression') {
			// 			let a = prop.value.start;
			// 			if (!prop.method) a += 8;
			// 			while (source[a] !== '(') a += 1;

			// 			let b = params[0].start;
			// 			code.overwrite(a, b, '({ ');

			// 			a = b = params[params.length - 1].end;
			// 			while (source[b] !== ')') b += 1;
			// 			code.overwrite(a, b + 1, ' })');
			// 		} else if (prop.value.type === 'ArrowFunctionExpression') {
			// 			let a = prop.value.start;
			// 			let b = params[0].start;

			// 			if (a !== b) code.remove(a, b);
			// 			code.prependRight(b, '({ ');

			// 			a = b = params[params.length - 1].end;
			// 			while (source[b] !== '=') b += 1;

			// 			if (a !== b) code.remove(a, b);
			// 			code.appendLeft(a, ' }) ');
			// 		}
			// 	});
			// }

			// if (properties.methods) {
			// 	properties.methods.properties.forEach(prop => {
			// 		methods[prop.key.name] = prop.value;
			// 	});
			// }

			code.overwrite(defaultExport.start, defaultExport.end, blocks.join('\n\n'));
		}

		code.appendLeft(result.ast.js.end, '\n\n');
		code.move(result.ast.js.start, result.ast.js.end, 0);
	}

	walk(result.ast.html, {
		enter(node) {
			let a = node.start;
			let b = node.end;

			switch (node.type) {

			}
		},

		leave(node) {

		}
	});



	return code.toString().trim();
}

function handleData(node, props, code, blocks) {
	if (!/FunctionExpression/.test(node.type)) {
		error(`can only convert 'data' if it is a function expression or arrow function expression`, node.start);
	}

	let returned;

	if (node.body.type === 'BlockStatement') {
		walk(node.body, {
			enter(child, parent) {
				if (child.type === 'ReturnStatement') {
					if (parent !== node.body) {
						console.log({ parent });
						error(`can only convert data with a top-level return statement`, child.start);
					}

					if (returned) {
						error(`duplicate return statement`, child.start);
					}

					const index = node.body.body.indexOf(child);
					if (index !== 0) {
						throw new Error(`TODO handle statements before return`);
					}

					returned = child.argument;
				}
			}
		});

		if (!returned) {
			error(`missing return statement`, child.start);
		}
	} else {
		returned = node.body;
		while (returned.type === 'ParenthesizedExpression') returned = returned.expression;

		if (returned.type !== 'ObjectExpression') {
			error(`can only convert an object literal`, returned.start);
		}
	}

	returned.properties.forEach(prop => {
		props.set(prop.key.name, code.original.slice(prop.value.start, prop.value.end));
	});
}