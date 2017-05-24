var rfr = require('rfr');
var _ = require('lodash');
var Component = rfr('src/component');
var matter = require('gray-matter');

/**
 * @constructs
 */
function Parser() {}

/* ---------------------------------------------------------------------
 * Public
 * --------------------------------------------------------------------- */

/**
 * Parses docs from source content.
 *
 * @param {String} source
 * @param {String} [extension]
 * @return {Array.<Component>}
 */
Parser.prototype.parse = function(content, extension) {
	var docs = _(getDocBlocks(content, extension))
		.map(parseDocBlock)
		.flatten()
		.thru(Component.merge)
		.value();

	return docs;
};

/* ---------------------------------------------------------------------
 * Private
 * --------------------------------------------------------------------- */

function getDocBlocks(fileContent, fileExtension) {
	return isMarkdown(fileExtension)
		? getMarkdownDocBlocks(fileContent)
		: getSourceCodeDocBlocks(fileContent);
}

function isMarkdown(fileExtension) {
	return _.includes(['markdown', 'mdown', 'md'], fileExtension);
}

function getMarkdownDocBlocks(fileContent) {
	return [fileContent];
}

function getSourceCodeDocBlocks(fileContent) {
	var docBlocks = fileContent.match(/\/\*([\s\S]+?)\*\//g);

	// Removes extraneous asterisks from the start & end of comment blocks
	docBlocks = _.map(docBlocks, (docBlock) => /\/\*[\s\*]*([\s\S]+?)?[ \t\*]*\*\//g.exec(docBlock)[1]);

	return docBlocks;
}

// @todo Refactor below

function parseDocBlock(docBlock) {
	var docs = [];
	var doc = new Component();
	var parsed = matter(docBlock);
	var name;

	if (parsed.data.name) {
		name = parsed.data.name;
	}
	else {
		// No name available or inferrable, so bailing
		return docs;
	}

	doc.setName(name);
	doc.setCategory(parsed.data.category);

	var metas = _.omit(parsed.data, ['name', 'category'])

	_.forEach(metas, function(meta, key) {
		if (_.isArray(meta)) {
			_.forEach(meta, function(value) {
				doc.addMeta(key, value);
			});
		}
		else {
			doc.addMeta(key, meta);
		}
	});

	var description = parseDescriptionMarkdown(parsed.content, doc);
	doc.setDescription(description);

	docs = [doc];

	return docs;
}

function parseDescriptionMarkdown(markdown, doc) {
	var description = markdown;

	// Extracts blocks from description
	var blocks = description.match(/```(.*\n)+?```/g);

	var codeBlocksByExample = {};
	var optionsByExample = {};

	// Extracts examples from description blocks
	_.forEach(blocks, function(block) {
		var matches = block.match(/```\s*([^\.\s]+)\.(\w+)(.*)\n/);
		var name = matches ? matches[1] : null;
		var extension = matches ? matches[2] : null;
		var optionsString = matches ? matches[3] : '';

		if (!name) {
			// Unnamed examples are not renderable
			return;
		}

		var code = block
			.replace(/```.*\n/m, '')  // Removes leading ```[extension]
			.replace(/\n```.*/m, '');  // Removes trailing ```

		var options = _(optionsString)
			.split(' ')
			.transform(function(options, optionStr) {
				var parts = optionStr.split('=');
				var name = parts[0];
				var value = parts[1];
				options[name] = value;
			}, {})
			.value();

		var codeBlock = {
			extension: extension,
			code: code,
			hidden: _.has(options, 'hidden'),
		};

		if (options.height) {
			codeBlock.height = options.height;
		}

		codeBlocksByExample[name] = codeBlocksByExample[name] || [];
		codeBlocksByExample[name].push(codeBlock);
		optionsByExample[name] = optionsByExample[name] || {};

		var height = optionsByExample[name].height || options.height;
		if (height) {
			optionsByExample[name].height = height;
		}
	});

	_.forEach(codeBlocksByExample, function(codeBlocks, exampleName) {
		var options = optionsByExample[exampleName];
		doc.addExample(exampleName, codeBlocks, options);
	});

	var hasExample = {};

	// Adds <example> tags for renderable HTML examples
	_.forEach(doc.getExamples(), function(example, name) {
		var exampleHtml = example.options.height
			? '<example name="' + name + '" height="' + example.options.height + '"></example>\n'
			: '<example name="' + name + '"></example>\n';

		description = description.replace(
			new RegExp('```\\s*' + name + '\\.(html|jsx|handlebars|hbs)', 'gm'),
			function(match, extension) {
				if (hasExample[name]) {
					return '```' + extension;
				}
				else {
					hasExample[name] = true;
					return exampleHtml + '```' + extension;
				}
			}
		);
	});

	// Removes hidden blocks
	description = description.replace(/\n?```[^\n]+hidden(?:.*\n)+?```/g, '');

	// Removes custom block annotations
	description = description.replace(/```([^\.\s,]+)\.(\w+)(?:,(\S+))?/g, '```$2');

	return description;
}

module.exports = Parser;
