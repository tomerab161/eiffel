// House style rules (D41, D43) that Biome and core ESLint can't express. Plain ESLint rules, no dependencies.
// Humans own this file (integrity gate). Agents never disable these rules.

const isInternal = (source, internalPrefixes) =>
  source.startsWith('.') || internalPrefixes.some((prefix) => source.startsWith(prefix))

const functionBody = (node) => (node.body && node.body.type === 'BlockStatement' ? node.body : null)

const isMethod = (node) => ['MethodDefinition', 'Property', 'TSAbstractMethodDefinition'].includes(node.parent?.type) && node.parent.value === node

/** const verb = (thing: Type): Type => {}. No `function` declarations or expressions (class and object methods are fine). */
const arrowFunctionsOnly = {
  meta: { type: 'suggestion', messages: { arrow: 'Write functions as `const verb = (thing: Type): Type => { … };`, not with `function`.' } },
  create: (context) => ({
    FunctionDeclaration: (node) => {
      if (!node.declare) {
        context.report({ node, messageId: 'arrow' })
      }
    },
    FunctionExpression: (node) => {
      if (!isMethod(node)) {
        context.report({ node, messageId: 'arrow' })
      }
    },
  }),
}

/** A named arrow function (`const verb = (…) => …`) types every parameter and its return value. Inline callbacks are exempt. */
const typedArrowConstants = {
  meta: {
    type: 'suggestion',
    messages: {
      param: 'Type every parameter of `{{name}}`: `(thing: Type)`.',
      returns: 'Give `{{name}}` an explicit return type: `(…): Type =>`.',
    },
  },
  create: (context) => ({
    'VariableDeclarator > ArrowFunctionExpression': (node) => {
      const name = node.parent.id?.name ?? 'this function'
      const typedByVariable = Boolean(node.parent.id?.typeAnnotation)

      if (!typedByVariable) {
        for (const param of node.params) {
          const target = param.type === 'AssignmentPattern' ? param.left : param

          if (!target.typeAnnotation && param.type !== 'TSParameterProperty') {
            context.report({ node: param, messageId: 'param', data: { name } })
          }
        }

        if (!node.returnType) {
          context.report({ node, messageId: 'returns', data: { name } })
        }
      }
    },
  }),
}

/** One `return`, as the last statement of the function body. Expression-bodied arrows are fine. */
const singleReturn = {
  meta: { type: 'suggestion', messages: { single: 'Return once, at the end of the function. Keep the result in a `const` and return it last.' } },
  create: (context) => {
    const stack = []
    const enter = (node) => stack.push({ node, returns: [] })
    const exit = () => {
      const { node, returns } = stack.pop()
      const body = functionBody(node)
      const last = body?.body.at(-1)

      for (const ret of returns) {
        if (ret !== last) {
          context.report({ node: ret, messageId: 'single' })
        }
      }
    }

    return {
      FunctionDeclaration: enter,
      FunctionExpression: enter,
      ArrowFunctionExpression: enter,
      'FunctionDeclaration:exit': exit,
      'FunctionExpression:exit': exit,
      'ArrowFunctionExpression:exit': exit,
      ReturnStatement: (node) => {
        stack.at(-1)?.returns.push(node)
      },
    }
  },
}

/** All exports sit together at the end of the file: `export { a, b };`. No inline `export const` or `export default`. */
const exportsAtEnd = {
  meta: {
    type: 'suggestion',
    messages: {
      inline: 'Declare it first, then export it at the end of the file: `export { name };`.',
      last: 'Exports go at the end of the file, after every other statement.',
    },
  },
  create: (context) => ({
    Program: (program) => {
      const isExport = (s) => ['ExportNamedDeclaration', 'ExportAllDeclaration', 'ExportDefaultDeclaration'].includes(s.type)
      const lastNonExport = program.body.findLastIndex((s) => !isExport(s))

      program.body.forEach((statement, index) => {
        const inline =
          (statement.type === 'ExportNamedDeclaration' && statement.declaration) ||
          (statement.type === 'ExportDefaultDeclaration' && statement.declaration.type !== 'Identifier')

        if (inline) {
          context.report({ node: statement, messageId: 'inline' })
        } else if (isExport(statement) && index < lastNonExport) {
          context.report({ node: statement, messageId: 'last' })
        }
      })
    },
  }),
}

/** A blank line before every `if` and `return`, unless it opens its block. */
const blankLineBefore = {
  meta: { type: 'layout', fixable: 'whitespace', messages: { blank: 'Leave a blank line before `{{kind}}`.' } },
  create: (context) => {
    const source = context.sourceCode
    const check = (node, kind) => {
      const previous = source.getTokenBefore(node, { includeComments: true })
      const opensBlock = !previous || previous.value === '{' || node.parent.type === 'SwitchCase' && node.parent.consequent[0] === node
      const isElseIf = node.parent.type === 'IfStatement' && node.parent.alternate === node

      if (!opensBlock && !isElseIf && previous.loc.end.line >= node.loc.start.line - 1) {
        context.report({
          node,
          messageId: 'blank',
          data: { kind },
          fix: (fixer) => fixer.insertTextAfter(previous, '\n'),
        })
      }
    }

    return {
      IfStatement: (node) => check(node, 'if'),
      ReturnStatement: (node) => check(node, 'return'),
    }
  },
}

/** Package imports first, then one blank line, then the project's own imports. */
const importGroups = {
  meta: {
    type: 'layout',
    schema: [{ type: 'object', properties: { internalPrefixes: { type: 'array', items: { type: 'string' } } } }],
    messages: {
      order: 'Import packages first, then the project\'s own modules.',
      blank: 'Leave one blank line between package imports and the project\'s own imports.',
      noBlank: 'Keep imports of the same group together, with no blank line.',
    },
  },
  create: (context) => {
    const internalPrefixes = context.options[0]?.internalPrefixes ?? ['@/']

    return {
      Program: (program) => {
        const imports = program.body.filter((s) => s.type === 'ImportDeclaration')

        imports.forEach((current, index) => {
          const previous = imports[index - 1]

          if (previous) {
            const wasInternal = isInternal(previous.source.value, internalPrefixes)
            const internal = isInternal(current.source.value, internalPrefixes)
            const gap = current.loc.start.line - previous.loc.end.line - 1

            if (wasInternal && !internal) {
              context.report({ node: current, messageId: 'order' })
            } else if (!wasInternal && internal && gap !== 1) {
              context.report({ node: current, messageId: 'blank' })
            } else if (wasInternal === internal && gap > 0) {
              context.report({ node: current, messageId: 'noBlank' })
            }
          }
        })
      },
    }
  },
}

/** No magic strings: a string that drives logic (compared, switched on, used as a default) lives in a named constant. */
const noMagicStrings = {
  meta: {
    type: 'suggestion',
    schema: [{ type: 'object', properties: { allow: { type: 'array', items: { type: 'string' } } } }],
    messages: { magic: 'Move "{{value}}" into a named constant (constants/ or the feature\'s constants file).' },
  },
  create: (context) => {
    const allow = new Set(['', ...(context.options[0]?.allow ?? [])])
    const comparisons = ['===', '!==', '==', '!=']
    const isTypeofCheck = (parent) => [parent.left, parent.right].some((side) => side.type === 'UnaryExpression' && side.operator === 'typeof')
    const drivesLogic = (node) => {
      const parent = node.parent
      const compared = parent.type === 'BinaryExpression' && comparisons.includes(parent.operator) && !isTypeofCheck(parent)
      const switched = parent.type === 'SwitchCase' && parent.test === node
      const defaulted = parent.type === 'AssignmentPattern' && parent.right === node

      return compared || switched || defaulted
    }
    const check = (node, value) => {
      if (typeof value === 'string' && !allow.has(value) && drivesLogic(node)) {
        context.report({ node, messageId: 'magic', data: { value } })
      }
    }

    return {
      Literal: (node) => check(node, node.value),
      'TemplateLiteral[expressions.length=0]': (node) => check(node, node.quasis[0].value.cooked),
    }
  },
}

const plugin = {
  meta: { name: 'house-style' },
  rules: {
    'arrow-functions-only': arrowFunctionsOnly,
    'typed-arrow-constants': typedArrowConstants,
    'single-return': singleReturn,
    'exports-at-end': exportsAtEnd,
    'blank-line-before': blankLineBefore,
    'import-groups': importGroups,
    'no-magic-strings': noMagicStrings,
  },
}

export default plugin
