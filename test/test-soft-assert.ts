import { test } from 'zora'; // TODO dogfood ducktest!
import { expect } from 'chai';
import { soften } from '../dist/soft-assert.js';

test('soften chai expect', assert => {
    let exception: any;
    const softExpect = soften(expect, e => exception = e);

    assert.test('soft failure of to.be.equal()', assert => {
        softExpect(true).to.be.equal(false, 'the truth is what you make it');
        assert.equals(exception.message, 'the truth is what you make it: expected true to equal false');
        // Truth is objective.
    });
    assert.test('soft failure of to.be.false', assert => {
        softExpect('love').to.be.false;
        assert.equals(exception.message, "expected 'love' to be false");
        // It's true love.
    });
    assert.test('soft failure of to.have.property().but.not.to.have.property()', assert => {
        const children = { seen: { heard: '' } };
        softExpect(children).to.have.property('seen').but.not.to.have.property('heard');
        assert.equals(exception.message, "expected { heard: '' } to not have property 'heard'");
        // Children should be seen and heard.
    });
});
