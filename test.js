var fixture = require('broccoli-fixture');
var Rollup = require('./index');
var expect = require('chai').expect;
var testHelpers = require('broccoli-test-helpers');
var makeTestHelper = testHelpers.makeTestHelper;
var fs = require('fs');
var path = require('path');
var cleanupBuilders = testHelpers.cleanupBuilders;

var inputFixture = {
  'add.js': 'function add(a) { return a + 1; }\n export { add };',
  'index.js': 'import { add } from "./add"; const two = add(1); export default two;'
};

describe('broccoli-rollup', function(done) {
  it('should transpile', function() {
    var node = new fixture.Node(inputFixture);
    var r = new Rollup(node, {
      inputFiles: ['*.js'],
      rollup: {
        entry: 'index.js',
        dest: 'out.js'
      }
    });

    return fixture.build(r).then(function(outputFixture) {
      expect(outputFixture['out.js']).to.eql('function add(a) { return a + 1; }\n\nconst two = add(1);\n\nexport default two;')
    });
  });
  
  it('should rebuild', function() {
    var rollup = makeTestHelper({
      subject: Rollup,
      fixturePath: path.resolve('fixtures')
    });
    
    
    var index = fs.readFileSync('fixtures/index.js', 'utf8');
    
    return rollup('.', {
      inputFiles: ['*.js'],
      rollup: {
        entry: 'index.js',
        dest: 'out.js'
      }
    }).then(function(result) {
      fs.writeFileSync(
        path.resolve('fixtures/index.js'),
        "import { add } from './add'; let i = add(2); export default i;"
      );
      return result.builder();
    }).then(function(result) {
      expect(fs.readFileSync(result.directory + '/out.js', 'utf8'),
             "import { add } from './add'; let i = add(2); export default i;");
    }).finally(function() {
      fs.writeFileSync('fixtures/index.js', index);
    });
  });
});