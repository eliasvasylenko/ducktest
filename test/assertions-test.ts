import { testcase, subcase } from '../dist/ducktest.js';
import { soften } from '../dist/assertions.js';
import { expect } from 'chai';

testcase('soften chai expect', async () => {
    let exception: any;
    const softExpect = soften(expect, e => exception = e);

    subcase('soft failure of to.be.equal()', () => {
        softExpect(true).to.be.equal(false, 'the truth is what you make it');
        expect(exception.message).to.equal('the truth is what you make it: expected true to equal false');
        // Truth is objective.
    });

    subcase('soft failure of to.be.false', async () => {
        softExpect('love').to.be.false;
        expect(exception.message).to.equal("expected 'love' to be false");
        // It's true love.
    });

    subcase('soft failure of to.have.property().but.not.to.have.property()', () => {
        const children = { seen: { heard: '' } };
        softExpect(children).to.have.property('seen').but.not.to.have.property('heard');
        expect(exception.message).to.equal("expected { heard: '' } to not have property 'heard'");
        // Children should be seen and heard.
    });
});
