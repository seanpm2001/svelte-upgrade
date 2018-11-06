import { walk } from 'estree-walker';
import { create_scopes } from '../scopes';
import is_reference from 'is-reference';

export default function handle_computed(node, info) {
	const { props, code, blocks, indent } = info;

	node.properties.forEach(computed => {
		const declarations = computed.value.params[0].properties
			.filter(param => param.value.type !== 'Identifier')
			.map(param => {
				const { name } = param.key;
				const lhs = code.slice(param.value.start, param.value.end);
				const rhs = info.computed.has(name) ? `${name}()` : name;
				return `const ${lhs} = ${rhs};`
			});

		// need to rewrite x => x() if x is computed
		let { map, scope } = create_scopes(computed.value.body);
		walk(computed.value.body, {
			enter(node, parent) {
				if (map.has(node)) {
					scope = map.get(node);
				}

				if (is_reference(node, parent)) {
					if (info.computed.has(node.name)) {
						code.appendLeft(node.end, '()');
					}
				}
			},

			leave(node) {
				if (map.has(node)) {
					scope = scope.parent;
				}
			}
		});

		const implicit_return = (
			computed.value.type === 'ArrowFunctionExpression' &&
			computed.value.body.type !== 'BlockStatement'
		);

		if (implicit_return) {
			const expression = code.slice(computed.value.body.start, computed.value.body.end);
			const statements = declarations.concat(`return ${expression};`).join(`\n${indent}${indent}`);

			blocks.push(`function ${computed.key.name}() {\n${indent}${indent}${statements}\n${indent}}`);
		} else {
			if (declarations.length) {
				const i = indent + indent + indent + indent;

				const declaration_block = declarations.join(`\n${i}`);
				code.appendLeft(computed.value.body.start + 1, `\n${i}${declaration_block}`);
			}

			const body = code.slice(computed.value.body.start, computed.value.body.end)
				.replace(info.indent_regex, '')
				.replace(info.indent_regex, '');

			blocks.push(`function ${computed.key.name}() ${body}`);
		}
	});
}