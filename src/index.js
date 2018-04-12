import * as svelte from 'svelte';
import MagicString from 'magic-string';
import { walk, childKeys } from 'estree-walker';

// We need to tell estree-walker that it should always
// look for an `else` block, otherwise it might get
// the wrong idea about the shape of each/if blocks
childKeys.EachBlock = childKeys.IfBlock = ['children', 'else'];
childKeys.Attribute = ['value'];

export function upgradeTemplate(source) {
	const code = new MagicString(source);
	const ast = svelte.parse(source);

	function trimStart(node) {
		let c = node.start;

		code.remove(c, c + 1);

		c = node.expression.end;
		while (source[c] !== '}') c += 1;
		code.remove(c, c + 1);
	}

	function trimEnd(node) {
		let c = node.end;

		code.remove(c - 1, c);

		while (source[c - 1] !== '{') c -= 1;
		code.remove(c - 1, c);
	}

	function trim(node) {
		trimStart(node);
		trimEnd(node);
	}

	walk(ast, {
		enter(node) {
			let a = node.start;
			let b = node.end;

			switch (node.type) {
				case 'MustacheTag':
					trimStart(node);
					break;

				case 'RawMustacheTag':
					code.overwrite(a + 1, node.expression.start, '@html ').remove(b - 2, b);
					break;

				case 'AwaitBlock': 
					trim(node);

					if (node.pending.start !== null) {
						let c = node.then.start;
						code.overwrite(c + 1, c + 2, ':');

						while (source[c] !== '}') c += 1;
						code.remove(c, c + 1);
					}

					if (node.catch) {
						let c = node.catch.start;
						code.overwrite(c + 1, c + 2, ':');

						while (source[c] !== '}') c += 1;
						code.remove(c, c + 1);
					}

					break;

				case 'IfBlock':
					if (!node.skip) trim(node);

					if (node.else) {
						let c = node.children[node.children.length - 1].end;
						while (source[c] !== '{') c += 1;
						code.overwrite(c + 1, c + 2, ':');

						if (node.else.children.length === 1 && node.else.children[0].type === 'IfBlock') {
							c = node.else.children[0].expression.end;
							node.else.children[0].skip = true;
						}
						
						while (source[c] !== '}') c += 1;
						code.remove(c, c + 1);
					}
					break;

				case 'EachBlock':
					trim(node);

					if (node.key) {
						let a = node.expression.end;
						while (source[a] !== '@') a += 1;
						code.overwrite(a, a + 1, `key ${node.context}.`);
					}

					break;

				case 'Element':
					if (node.name === 'slot' && /{{\s*yield\s*}}/.test(source.slice(a, b))) {
						code.overwrite(a, b, '<slot></slot>');
					}
			}
		},

		leave(node) {

		}
	});

	return code.toString();
}