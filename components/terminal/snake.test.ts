import assert from "node:assert/strict";
import { test } from "node:test";
import { newGame, step, turn } from "./snake";

const first = () => 0;

test("snake moves, eats and grows", () => {
    const game = newGame(10, 10, first);
    assert.deepEqual(game.body[0], [5, 5]);
    game.food = [6, 5];
    step(game, first);
    assert.deepEqual(game.body[0], [6, 5]);
    assert.equal(game.body.length, 4);
    assert.equal(game.score, 1);
    assert.equal(game.body.some(([x, y]) => x === game.food[0] && y === game.food[1]), false);
});

test("snake can't u-turn, but two quick turns both count", () => {
    const game = newGame(10, 10, first);
    turn(game, "left");
    assert.deepEqual(game.queued, []);
    turn(game, "up");
    turn(game, "left");
    step(game);
    step(game);
    assert.deepEqual(game.body[0], [4, 4]);
});

test("snake dies on the wall and on itself", () => {
    const wall = newGame(6, 6, first);
    for (let i = 0; i < 3; i++) step(wall);
    assert.equal(wall.over, true);

    const self = newGame(10, 10, first);
    self.body = [[5, 5], [4, 5], [4, 6], [5, 6], [6, 6], [6, 5]];
    self.dir = "up";
    turn(self, "left");
    step(self);
    turn(self, "down");
    step(self);
    assert.equal(self.over, true);
});

test("moving into the cell the tail just left is fine", () => {
    const game = newGame(10, 10, first);
    game.body = [[5, 5], [5, 6], [4, 6], [4, 5]];
    game.dir = "up";
    game.food = [0, 0];
    turn(game, "left");
    step(game);
    assert.equal(game.over, false);
});
