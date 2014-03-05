/*
  Disk entity:
  - x : Integer
  - y : Integer
  - side : Integer (1 or 2)
*/

Players = new Meteor.Collection("players");
Disks   = new Meteor.Collection("disks");
Games   = new Meteor.Collection("games");
var CELL_SIZE           = 33; /* including border at one side */
var CELL_BORDER         = 2;
var CELL_CENTER_OFFSET  = CELL_BORDER + CELL_SIZE / 2;
var DISK_RADIUS         = CELL_SIZE * 0.375;
var DISK_VACANT_RADIUS  = DISK_RADIUS / 5;
var FLIP_ANIMATE_TIME   = 500; /* ms */
var FLIP_ANIMATE_STEPS  = 10;
var FLIP_DELAY          = FLIP_ANIMATE_TIME / FLIP_ANIMATE_STEPS;
var DISK_BORDER         = 2;
var N                   = 8;
var GRID_BORDER         = 4;
var GRID_SIZE           = (CELL_SIZE) * N + CELL_BORDER + 2 * GRID_BORDER;
var BG_COLOR            = '#00CC66'; /* nice green */
var GRID_COLOR          = '#003366'; /* dark blue */
var DISK_BORDER_COLOR   = '#002E5C'; /* medium blue */
var DISK_DARK_SIDE      = '#000000'; /* dark */
var DISK_LIGHT_SIDE     = '#FFFFFF'; /* bright */
var VACANT_COLOR        = '#00FF00'; /* real green */
var adj = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1], [0, 1],
    [1, -1], [1, 0], [1, 1]
];
var FREE_CELL   = 0;
var VACANT_CELL = 3;
var DARK_SIDE   = 1;
var LIGHT_SIDE  = 2;

if (Meteor.isClient) {
    var field = undefined;
    var flipContext = undefined;
    var cells = new Array(N);
    for (var i = 0; i < N; ++i)
        cells[i] = new Array(N);

    var getUserId = function () {
        return (Meteor.user() && Meteor.user()._id) || '';
    }

    var getUserNameById = function (id) {
        return Meteor.users.findOne({_id: id}).username;
    }

    var getIdByUserName = function (username) {
        return Meteor.users.find({username: username}).fetch()[0]._id;
    }

    var getGame = function () {
        var user = getUserId();
        if (user === '')
            return undefined;
        var asDark = Games.findOne({dark: user, darkAccepted: true});
        if (typeof asDark !== 'undefined')
            return asDark;
        /* or game on light side */
        return Games.findOne({light: user, lightAccepted: true});
    }

    var getField = function () {
        if (typeof field === 'undefined') {
            console.log("creating SVG-based field");
            var svg = d3.select("#grid").append("svg")
                    .attr("width", GRID_SIZE)
                    .attr("height", GRID_SIZE);
            var bg = svg.append("rect")
                        .attr("x", 0)
                        .attr("y", 0)
                        .attr("width", GRID_SIZE)
                        .attr("height", GRID_SIZE)
                        .attr("fill", BG_COLOR);
            var borders = _.map(_.range(N + 1), function (i) {
                return GRID_BORDER + i * CELL_SIZE; 
            });
            /* rightmost or bottom point of line */
            var greaterValue = GRID_BORDER + N * CELL_SIZE + CELL_BORDER / 2;
            var horizontals = svg.append("g").attr("class", "horizontals")
                            .selectAll("line")
                            .data(borders)
                            .enter()
                            .append("line");
            horizontals
                .attr("x1", GRID_BORDER)
                .attr("y1", function(d) { return d; })
                .attr("x2", greaterValue)
                .attr("y2", function(d) { return d; })
                .attr("stroke-width", CELL_BORDER)
                .attr("stroke", GRID_COLOR);
            var verticals = svg.append("g").attr("class", "verticals")
                            .selectAll("line")
                            .data(borders)
                            .enter()
                            .append("line");
            verticals
                .attr("x1", function(d) { return d; })
                .attr("y1", GRID_BORDER)
                .attr("x2", function(d) { return d; })
                .attr("y2", greaterValue)
                .attr("stroke-width", CELL_BORDER)
                .attr("stroke", GRID_COLOR);
            var diskGroup = svg.append("g").attr("class", "disks");
            var flipGroup = svg.append("g").attr("class", "flip");
            var vacantGroup = svg.append("g").attr("class", "vacant");
            var flipRadii = _.map(_.range(FLIP_ANIMATE_STEPS + 1), function (i) {
                var angle = Math.PI * i / FLIP_ANIMATE_STEPS;
                return DISK_RADIUS * Math.abs(Math.cos(angle));
            });
            field = {
                "svg": svg,
                "bg": bg,
                "horizontals": horizontals,
                "verticals": verticals,
                "disks": diskGroup,
                "flip": flipGroup,
                "vacant": vacantGroup,
                "radii": flipRadii
            };
        }
        return field;
    }

    var cellIdToCoordinate = function (cellId) {
        return GRID_BORDER + cellId * CELL_SIZE + CELL_CENTER_OFFSET - 2;
    }

    var drawDisksOnSvg = function (gameId) {
        var fd = getField();
        fd.disks.selectAll("circle").remove();
        flipContext = undefined;
        fd.flip.selectAll("ellipse").remove();
        fd.vacant.selectAll("circle").remove();
        var nonFlippingDisks = Disks.find({flip: {$not: true}, game: gameId}).fetch();
        fd.disks
            .selectAll("circle")
            .data(nonFlippingDisks)
            .enter()
            .append("circle")
            .attr("cx", function(d) { return cellIdToCoordinate(d.x); })
            .attr("cy", function(d) { return cellIdToCoordinate(d.y); })
            .attr("r", DISK_RADIUS)
            .style("fill", function (d) {
                return d.side === 1 ? DISK_DARK_SIDE : DISK_LIGHT_SIDE;
            })
            .style("stroke", DISK_BORDER_COLOR)
            .style("stroke-width", DISK_BORDER);
        if (Games.findOne({_id: gameId}).finished)
            return;
        var flippingDisks = Disks.find({flip: true, game: gameId}).fetch();
        if (flippingDisks.length === 0) {
            drawVacancies(gameId);
            return;
        }
        var ellipsis = fd
            .flip
            .selectAll("ellipse")
            .data(flippingDisks)
            .enter()
            .append("ellipse");
        var startSide = 3 - flippingDisks[0].side;
        flipContext = {
            /* changes from 0 to FLIP_ANIMATE_STEPS */
            "step": 0,
            "radii": fd.radii,
            "side": startSide,
            "selection": ellipsis,
        };
        flipHandler();
    }

    var clearField = function () {
        var fd = getField();
        fd.disks.selectAll("circle").remove();
        flipContext = undefined;
        fd.flip.selectAll("ellipse").remove();
        fd.vacant.selectAll("circle").remove();
    }

    var sideToColor = function(side) {
        return side === 1 ? DISK_DARK_SIDE : DISK_LIGHT_SIDE;
    }

    var drawEllipsis = function (selection, smallR, color) {
        selection
            .attr("cx", function(d) { return cellIdToCoordinate(d.x); })
            .attr("cy", function(d) { return cellIdToCoordinate(d.y); })
            .attr("rx", smallR)
            .attr("ry", DISK_RADIUS)
            .style("fill", color)
            .style("stroke", DISK_BORDER_COLOR)
            .style("stroke-width", DISK_BORDER);
    }

    var clearFlipped = function () {
        var flipped = _.map(Disks.find({flip: true}).fetch(), function(disk) {
            return disk._id;
        });
        _.map(flipped, function(id) {
            Disks.update({_id: id}, {$set: {flip: false}});
        });
    }

    var flipHandler = function handler() {
        var context = flipContext;
        if (typeof context === 'undefined')
            return;
        var step = context.step;
        if (step >= FLIP_ANIMATE_STEPS) {
            clearFlipped();
            flipContext = undefined;
            return;
        }
        if (step == (FLIP_ANIMATE_STEPS - FLIP_ANIMATE_STEPS / 2))
            context.side = 3 - context.side;
        drawEllipsis(context.selection, context.radii[step],
            sideToColor(context.side));
        context.step = step + 1;
        setTimeout(handler, FLIP_DELAY);
    }

    var findVacancies = function (player) {
        var other = 3 - player;
        var vacancies = []
        for (var x = 0; x < N; ++x)
            for (var y = 0; y < N; ++y)
                if (cells[x][y] === player)
                    for (var k = 0; k < adj.length; ++k) {
                        var dx = adj[k][0],
                            dy = adj[k][1];
                        var u = x + dx;
                        var v = y + dy;
                        var len = 0;
                        while (cellValid(u, v) && cells[u][v] === other) {
                            u += dx;
                            v += dy;
                            ++len;
                        }
                        if (len > 0 && cellValid(u, v) && cells[u][v] === FREE_CELL) {
                            cells[u][v] = VACANT_CELL;
                            vacancies.push({"x": u, "y": v});
                        }
                    }
        return vacancies;
    };

    var drawVacancies = function (gameId) {
        var game = Games.findOne({_id: gameId});
        var playerSide = game.activeDark ? DARK_SIDE : LIGHT_SIDE;
        var vacancies = findVacancies(playerSide);
        console.log("found " + vacancies.length +
            " vacancies for player on side#" + playerSide);
        if (vacancies.length === 0) {
            playerSide = nextMove(gameId, playerSide);
            console.log("trying with player on side#" + playerSide);
            vacancies = findVacancies(playerSide);
            if (vacancies.length === 0) {
                console.log("vacancies not found for both players");
                finishGame(gameId);
            }
        }
        var fd = getField();
        fd.vacant
            .selectAll("circle")
            .data(vacancies)
            .enter()
            .append("circle")
            .attr("cx", function (d) { return cellIdToCoordinate(d.x); })
            .attr("cy", function (d) { return cellIdToCoordinate(d.y); })
            .attr("r", DISK_VACANT_RADIUS)
            .style("fill", VACANT_COLOR)
            .style("stroke", DISK_BORDER_COLOR)
            .style("stroke-width", DISK_BORDER);
    }

    var cellValid = function (i, j) {
        return 0 <= i && i < N && 0 <= j && j < N;
    }

    var oppositeSide = function(side) {
        if (side === DARK_SIDE)
            return LIGHT_SIDE;
        return DARK_SIDE;
    }

    var addDisk = function (x, y) {
        if (cells[x][y] !== VACANT_CELL) {
            console.log("Cell isn't available");
            return;
        }
        var game = getGame();
        var user = getUserId();
        if (!(game.dark === user && game.activeDark)
            && !(game.light === user && !game.activeDark)) {
            console.log("current player is waiting");
            return;
        }
        var gameId = game._id;
        var side = game.activeDark ? DARK_SIDE : LIGHT_SIDE;
        Disks.insert({x: x, y: y, side: side, game: gameId});
        var other = oppositeSide(side);
        for (var k = 0; k < adj.length; ++k) {
            var dx = adj[k][0],
                dy = adj[k][1];
            var u = x + dx;
            var v = y + dy;
            var len = 0;
            while (cellValid(u, v) && cells[u][v] === other) {
                u += dx;
                v += dy;
                ++len;
            }
            if (len > 0 && cellValid(u, v) && cells[u][v] === side) {
                for (; len > 0; --len) {
                    u -= dx;
                    v -= dy;
                    Disks.update({_id: Disks.findOne({x: u, y: v, game: gameId})._id},
                        {$set: {side: side, flip: true}});
                }
            }
        }
        nextMove(gameId, side);
    }

    /* returns side, which is opposite to @playerSide */
    var nextMove = function (gameId, playerSide) {
        var activeDark = playerSide === DARK_SIDE ? true : false;
        var nextActiveDark = !activeDark;
        Games.update({_id: gameId}, {$set: {activeDark: nextActiveDark}});
        return nextActiveDark ? DARK_SIDE : LIGHT_SIDE;
    }

    var finishGame = function (gameId) {
        Games.update({_id: gameId}, {$set: {finished: true}});
    }

    var createGame = function (currentForDark) {
        var opponentName = $('#createGame select option:selected').val();
        var opponent = getIdByUserName(opponentName);
        var me = getUserId();
        var newGame = {
            /* game always is started by dark side move */
            activeDark:     true,
            finished:       false,
            darkAccepted:   false,
            lightAccepted:  false,
        };
        if (currentForDark) {
            newGame.dark = me;
            newGame.darkAccepted = true;
            newGame.light = opponent;
        } else {
            newGame.dark = opponent;
            newGame.light = me;
            newGame.lightAccepted = true;
        }
        var gameId = Games.insert(newGame);
        var rg = Math.floor(N / 2);
        var lf = rg - 1;
        Disks.insert({x: lf, y: lf, side: DARK_SIDE, game: gameId});
        Disks.insert({x: rg, y: rg, side: DARK_SIDE, game: gameId});
        Disks.insert({x: lf, y: rg, side: LIGHT_SIDE, game: gameId});
        Disks.insert({x: rg, y: lf, side: LIGHT_SIDE, game: gameId});
    };

    var destroyGame = function (gameId) {
        console.log("destroyGame called");
        var game = Games.findOne({_id: gameId});
        if (typeof game === 'undefined')
            return;
        var disks = Disks.find({game: gameId}).count();
        for (; disks > 0; --disks) {
            Disks.remove({_id: Disks.findOne({game: gameId})._id});
        }
        Games.remove({_id: gameId});
    };

    Template.board.events({
        'click svg' : (function (event) {
            console.log("svg clicked");
            if (typeof flipContext !== 'undefined') {
                console.log("ignored because animation");
                return;
            }
            var svg = $("#grid svg")[0];
            var bRect = svg.getBoundingClientRect();
            var x = event.pageX - bRect.left - GRID_BORDER;
            var y = event.pageY - bRect.top - GRID_BORDER;
            if (x <= 0 || y <= 0) {
                console.log("miss: top or left border");
                return;
            }
            if (x % CELL_SIZE < CELL_BORDER || y % CELL_SIZE < CELL_BORDER) {
                console.log("miss: border");
                return;
            }
            var xId = Math.floor(x / CELL_SIZE);
            var yId = Math.floor(y / CELL_SIZE);
            if (xId >= N || yId >= N) {
                console.log("miss: rightmost or bottom border");
            }
            console.log("hit cell " + xId + "," + yId);
            addDisk(xId, yId);
        })
    });

    Template.board.rendered = function () {
        var self = this;
        if (!self.handle) {
            self.handle = Deps.autorun(function () {
                var game = getGame();
                if (typeof game === 'undefined') {
                    clearField();
                    return;
                }
                var disks = Disks.find({game: game._id});
                for (var i = 0; i < N; ++i)
                    for (var j = 0; j < N; ++j)
                        cells[i][j] = FREE_CELL;
                disks.forEach(function(disk) {
                    cells[disk.x][disk.y] = disk.side;
                });
                drawDisksOnSvg(game._id);
            });
        }
    };

    Template.gameStatus.showStatus = function () {
        return typeof getGame() !== 'undefined';
    };

    Template.gameStatus.status = function() {
        var result = {
            darkScore: 0,
            lightScore: 0
        };
        var user = getUserId();
        if (user === '' || user === null || typeof user === 'undefined')
            return result;
        var game = getGame();
        if (typeof game === 'undefined')
            return result;
        result.darkScore  = Disks.find({side:  DARK_SIDE, game: game._id}).count();
        result.lightScore = Disks.find({side: LIGHT_SIDE, game: game._id}).count();
        if (game.finished) {
            if (result.darkScore === result.lightScore) {
                result.mood = 'text-info';
                result.results = "Draw";
            } else if (result.darkScore > result.lightScore) {
                result.mood = user === game.dark ? 'text-success' : 'text-error';
                result.results = "Dark side won, Luke!";
            } else {
                result.mood = user === game.light ? 'text-success' : 'text-error';
                result.results = "Light side won, Luke!";
            }
        } else {
            if (game.activeDark)
                result.darkMove = true;
            else
                result.lightMove = true;
        }
        result.darkPlayer   = Meteor.users.findOne({_id: game.dark}).username;
        result.lightPlayer  = Meteor.users.findOne({_id: game.light}).username;
        return result;
    };

    Template.gameControls.events({
        'click #giveUpButton' : (function (event) {
            console.log("GiveUp button clicked");
            var game = getGame();
            if (typeof game !== 'undefined')
                destroyGame(game._id);
        }),
        'click #playForDark' : (function (event) {
            createGame(true);
        }),
        'click #playForLight' : (function (event) {
            createGame(false);
        }),
        'click #cancelWaiting' : (function (event) {
            console.log("clicked cancelWaiting");
            var game = getGame();
            if (typeof game !== 'undefined')
                destroyGame(game._id);
        }),
        'click #acceptGame' : (function(event) {
            var opponentName = $("#askedToPlay select option:selected").val();
            console.log("clicked to accept game with " + opponentName);
            var opponent = Meteor.users.findOne({username: opponentName});
            if (typeof opponent === 'undefined') {
                console.log("user " + opponentName + " not found");
                return;
            }
            var me = getUserId();
            var asDark = Games.findOne({
                dark: me, light: opponent._id,
                darkAccepted: false, lightAccepted: true
            });
            if (typeof asDark !== 'undefined') {
                Games.update({_id: asDark._id}, {$set: {darkAccepted: true}});
                console.log("game on dark side is accepted!");
                return;
            }
            var asLight = Games.findOne({
                dark: opponent._id, light: me,
                darkAccepted: true, lightAccepted: false
            });
            if (typeof asLight !== 'undefined') {
                Games.update({_id: asLight._id}, {$set: {lightAccepted: true}});
                console.log("game on light side is accepted!");
                return;
            }
            console.log("game to accept not found");
        }),
        'click #closeGame' : (function (event) {
            var game = getGame();
            if (typeof game !== 'undefined')
                destroyGame(game._id);
        })
    });

    Template.gameControls.loggedIn = function () {
        var user = Meteor.user();
        return user !== null 
            && (typeof Meteor.user() !== 'undefined');
    };

    /* returns hash with opponent name or undefined */
    Template.gameControls.waitingAcceptance = function () {
        var user = getUserId();
        var asDark = Games.find({dark: user, darkAccepted: true, lightAccepted: false});
        if (asDark.count() > 0)
            return { opponent: getUserNameById(asDark.fetch()[0].light) };
        var asLight = Games.find({light: user, darkAccepted: false, lightAccepted: true});
        if (asLight.count() > 0)
            return { opponent: getUserNameById(asLight.fetch()[0].dark) };
        return undefined;
    };

    /* returns array of usernames or undefined */
    Template.gameControls.askedForAcceptance = function () {
        var user = getUserId();
        var gamesAsDark = _.map(Games.find({dark: user, darkAccepted: false}).fetch(), function (g) {
            return getUserNameById(g.light);
        });
        var gamesAsLight = _.map(Games.find({light: user, lightAccepted: false}).fetch(), function (g) {
            return getUserNameById(g.dark);
        });
        return gamesAsDark.concat(gamesAsLight);
    };

    Template.gameControls.inGame = function () {
        var user = getUserId();
        return Games.find({$or: [{dark: user}, {light: user}], darkAccepted: true, lightAccepted: true}).count() > 0;
    };

    Template.gameControls.afterGame = function () {
        return getGame().finished;
    }

    Template.gameControls.noGame = function () {
        return typeof getGame() === 'undefined';
    }

    Template.gameControls.opponents = function () {
        return _.map(Meteor.users.find().fetch(), function (u) {
            return u.username;
        });
    }

    Accounts.ui.config({ passwordSignupFields: 'USERNAME_AND_OPTIONAL_EMAIL' });
}

if (Meteor.isServer) {
    Meteor.startup(function () {
        // code to run on server at startup
    });
}
