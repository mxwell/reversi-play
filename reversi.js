/*
  Disk entity:
  - x : Integer
  - y : Integer
  - side : Integer (1 or 2)
*/

Players = new Meteor.Collection("players");
Disks   = new Meteor.Collection("disks");
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

if (Meteor.isClient) {
    var field = undefined;
    var flipContext = undefined;
    var cells = new Array(N);
    for (var i = 0; i < N; ++i)
        cells[i] = new Array(N);

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

    var drawDisksOnSvg = function () {
        var fd = getField();
        fd.disks.selectAll("circle").remove();
        flipContext = undefined;
        fd.flip.selectAll("ellipse").remove();
        fd.vacant.selectAll("circle").remove();
        var nonFlippingDisks = Disks.find({
            $and: [
                {$or: [ {side: 1 }, {side: 2 } ]},
                {flip: {$not: true}}
            ]}).fetch();
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
        var flippingDisks = Disks.find({flip: true}).fetch();
        if (flippingDisks.length === 0) {
            drawVacancies();
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

    var drawVacancies = function () {
        if (!gameRunning())
            return;
        var player = activePlayer().id;
        var vacancies = findVacancies(player);
        console.log("found " + vacancies.length +
            " vacancies for player#" + player);
        if (vacancies.length === 0) {
            player = nextMove();
            console.log("trying with another player: " + player);
            if (typeof player === 'undefined')
                return;
            vacancies = findVacancies(player);
            if (vacancies.length === 0) {
                console.log("vacancies not found for both players");
                finishGame();
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

    var addDisk = function (x, y, player) {
        if (cells[x][y] !== VACANT_CELL) {
            console.log("Cell isn't available");
            return;
        }
        Disks.insert({x: x, y: y, side: player});
        var other = 3 - player;
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
            if (len > 0 && cellValid(u, v) && cells[u][v] === player) {
                for (; len > 0; --len) {
                    u -= dx;
                    v -= dy;
                    Disks.update({_id: Disks.findOne({x: u, y: v})._id},
                        {$set: {side: player, flip: true}});
                }
            }
        }
        nextMove();
    }

    var gameRunning = function () {
        return Players.find({active: true}).count() === 1 &&
               Players.find({active: false}).count() === 1 &&
                Disks.find({}).count() >= 4;
    }

    var respawn = function () {
        var disks = Disks.find().count();
        for (; disks > 0; --disks)
            Disks.remove({_id: Disks.findOne({})._id});
        var players = Players.find({}).count();
        for (; players > 0; --players)
            Players.remove({_id: Players.findOne({})._id});
        flipContext = undefined;
        var rg = Math.floor(N / 2);
        var lf = rg - 1;
        Disks.insert({x: lf, y: lf, side: 1});
        Disks.insert({x: rg, y: rg, side: 1});
        Disks.insert({x: lf, y: rg, side: 2});
        Disks.insert({x: rg, y: lf, side: 2});
        Players.insert({id: 1, active: true});
        Players.insert({id: 2, active: false});
    }

    var nextMove = function () {
        var active = activePlayer();
        var inactive = inactivePlayer();
        if (typeof active !== 'undefined' && typeof inactive !== 'undefined') {
            Players.update({_id: inactive._id}, {$set: {active: true}});
            Players.update({_id: active._id}, {$set: {active: false}});
            return inactive.id;
        }
        return undefined;
    }

    var finishGame = function () {
        var active = activePlayer();
        var inactive = inactivePlayer();
        if (typeof active !== 'undefined' && typeof inactive !== 'undefined')
            Players.update({_id: active._id}, {$set: {active: false}});
    }

    var activePlayer = function () {
        return Players.findOne({active: true});
    }

    var inactivePlayer = function () {
        return Players.findOne({active: false});
    }

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
            addDisk(xId, yId, activePlayer().id);
        }),
        'click #reset_button' : (function (event) {
            console.log("Reset button clicked");
            respawn();
        })
    });

    Template.board.rendered = function () {
        var self = this;
        if (!self.handle) {
            self.handle = Deps.autorun(function () {
                var disks = Disks.find();
                for (var i = 0; i < N; ++i)
                    for (var j = 0; j < N; ++j)
                        cells[i][j] = FREE_CELL;
                disks.forEach(function(disk) {
                    cells[disk.x][disk.y] = disk.side;
                });
                drawDisksOnSvg();
            });
        }
    };

    var calc_game_status = function () {
        var player1 = Players.findOne({id: 1})
        var player2 = Players.findOne({id: 2})
        if (typeof player1 === 'undefined' || typeof player2 === 'undefined')
            return;
        var first_cnt = Disks.find({side: 1}).count();
        var second_cnt = Disks.find({side: 2}).count();
        var result = {
            first: {
                score: first_cnt
            },
            second: {
                score: second_cnt
            },
        };
        result.first.css = "wait_move";
        result.second.css = "wait_move";
        if (player1.active) {
            result.first.css = "do_move";
        } else if (player2.active) {
            result.second.css = "do_move";
        } else {
            if (first_cnt === second_cnt) {
                result.game_result = "Draw";
            } else if(first_cnt > second_cnt) {
                result.game_result = "Dark side won, Luke!";
            } else {
                result.game_result = "Light side won, Luke!";
            }
        }
        if (typeof result.game_result === 'undefined')
            result.game_result = "";
        return result;
    }

    Template.game_status.rendered = function () {
        var self = this;
        if (!self.handle) {
            self.handle = Deps.autorun(function () {
                var stat = calc_game_status();
                if (typeof stat === 'undefined')
                    return;
                var status = "<div id=\"first\" class=\"" + stat.first.css + "\">\n";
                status += "Dark side: " + stat.first.score + "\n";
                status += "</div>\n";
                status += "<div id=\"second\" class=\"" + stat.second.css + "\">\n";
                status += "Light side: " + stat.second.score + "\n";
                status += "</div>\n";
                var html = "<div id=\"status\">\n" + status + "</div><br />\n" +
                    "<div style=\"clear:both\">" +
                    stat.game_result + "\n</div>\n";
                $('#game_info').html(html);
                console.log("game status rendered");
            });
        }
    };
}

if (Meteor.isServer) {
    Meteor.startup(function () {
        // code to run on server at startup
    });
}
