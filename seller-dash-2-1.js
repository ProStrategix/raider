import { currentMember } from 'wix-members-frontend'
import wixData from 'wix-data';
import wixLocationFrontend from 'wix-location-frontend';
import wixWindowFrontend from 'wix-window-frontend';
import {local} from 'wix-storage'

// Global variables
// Games
let gameId = "";
let currentGame = {};
let order = 0;
// Tickets
let allTickets = []     //Every Ticket in Inventory
let allMemberTickets = []  //Every Ticket Filtered by Member ID
let allMemberTicketsAtGame = []  // all Member Filtered by Game
let allListedTicketsAtGame = []
let allUnlistedTicketsAtGame =[]
let allSoldforGame = []
let member = {};
let price = 0;
let pendingPrice = 0;
let scope = "set"; // Default scope
// Listings
let pendingChanges = new Map() //Track checkbox changes: ticketId -> { action: 'add'|'remove', ticket }
let games = $w("#gamesList")
const GAMESARRAY  = ['f6d6867a-9837-4a12-ac9b-68e4dfd9ad0c','456f805a-eba3-44a0-8e64-7fd08c35ce5f','675641e6-15b6-452c-aede-a8c5e3213936','8ff29bbe-3ae1-48b3-a4c2-7ff17ec3c071','e934cb6f-dfed-45b2-9a83-5d446b9d8b26','59295c05-77c4-45c2-8b36-35664e424e23','3bd9b83a-e70f-4046-bc84-d5f8c7cdc0ff','eb0ad05e-4fc0-4818-b621-a2bedfcf2238','e563e7e7-732b-48e4-920d-668883f0b229','2ec2ba2f-5571-45bd-ae05-8038c28cae37'];

// Simple Helpers
import {formatCurrency, parseCurrency, goTo} from public/helpers.js

// THIS PROGRAM IS FOR SELLER DASHBOARD 2.0 FILE ONLY
// The are 5 key sections:
// 1. Choose a Game
// 2. Load Tickets and Listings
// 3. Handle Ticket Selection under Our Ticket Adjacency Rules
// 4. Handle Price Input and Validation under adapted pricing rules
// 5. Save Changes, so the listings are more easily accessible downstream

$w('#gameButton').onMouseIn((event) => {
    let $item = $w.at(event.context)
    $item("#gameButton").customClassList.toggle("shiny-white")
    $item("#game").style.color = "black"
    $item("#date").style.color = "black"
})

$w('#gameButton').onMouseOut((event) => {
    let $item = $w.at(event.context)
    $item("#gameButton").customClassList.toggle("silver-gradient")

})

$w('#gameButton').onClick((event) => {
    let $item = $w.at(event.context)
    $w("#spinner").show()
    gameData = await setupGame($item)
    console.log('gameData', gameData)
     loadTicketsAndListings(gameData)
});



// 2. Load Tickets and Listings
// The following code loads the seller's tickets and any existing listings for the selected game.
// Subprocess includes
// - authenticating the current member (seller)
// - querying the tickets database for tickets owned by the seller
// - querying the listings database for any existing listings for the selected game
// - populating the UI with the loaded tickets and listings

$w.onReady(async function () {
    try {
        member = await currentMember.getMember();
        console.log("Member loaded:", member._id);
        listing.memberId = member._id;
        // Show step 1
        $w("#step1").expand();
        setTimeout(() => {
            games.expand()
        }, 500);
    } catch (error) {
        console.error("Error loading member:", error);
    }
});

// This function loads all tickets for the selected game and filters them to only include tickets owned by the current member.
async function loadTicketsAndListings(gameData) {
    try {
        $w("#spinner").show();  // Ensure spinner is visible during load

        // Level 2: Load all seller tickets
        allMemberTickets = await loadGameTickets();

        // Level 3: Show only tickets that are listed OR unlisted for this game
        let isListed = allMemberTickets.filter(ticket => ticket.listedGames && ticket.listedGames.some(g => g._id === currentGame._id));
        let isUnlisted = allMemberTickets.filter(ticket => ticket.unlistedGames && ticket.unlistedGames.some(u => u._id === currentGame._id));
        allGameTickets = isListed.concat(isUnlisted);
        console.log(`Loaded ${allGameTickets.length} tickets for game ${currentGame.title} (${isListed.length} listed, ${isUnlisted.length} unlisted)`);

        displayTicketsInRepeater(allGameTickets, gameData);  // This will hide spinner and show repeater
        $w("#statusMessage").text = "Tickets loaded successfully.";
        setTimeout(() => {
            $w("#statusMessage").hide();
        }, 4000);
    } catch (error) {
        console.error("Error loading tickets and listings:", error);
        $w("#spinner").hide();
        if ($w("#statusMessage")) {
            $w("#statusMessage").text = "Error loading tickets. Please try again.";
            $w("#statusMessage").show();
        }
    }
}

// Load all tickets for the seller (not filtered by game - we show all seller tickets)
async function loadGameTickets() {
    try {
        // Load ALL tickets for the seller - we'll show which ones are listed for current game in the UI
        const ticketsResult = await wixData.query("Season106TicketHoldings")
            .include("listedGames")
            .include("unlistedGames")
            .include("psl")
            .eq("seller", member._id)
            .limit(1000)
            .find({ "suppressAuth": true })
            .then((results) => {
                if (results.items.length > 0) {
                    console.log("All tickets loaded:", results.items.length);
                    return results.items;
                } else {
                    console.log("No tickets found");
                    return [];
                }
            });
        return ticketsResult;
    } catch (error) {
        console.error("Error loading tickets:", error);
        return [];
    }
}

// End of Section 2

// 3. Handle Ticket Selection under Our Ticket Adjacency Rules
// The following code handles the selection of tickets by the seller, ensuring compliance with ticket adjacency rules.
// Key subprocesses include:
// - displaying tickets in a repeater with their details
// - handling switch changes to select/deselect tickets
// - validating ticket selections against adjacency rules

async function displayTicketsInRepeater(tickets, gameData) {
    const repeaterData = tickets.map(ticket => {
        // Check if ticket is listed for this game
        const isListed = ticket.listedGames && ticket.listedGames.some(g => g._id === currentGame._id);
        // Get price from ticket's listingPrices array (0-indexed, so order-1)
        const ticketPrice = (ticket.listingPrices && ticket.listingPrices[gameData.order - 1]) || 0;

        return {
            _id: ticket._id,
            psl: ticket.psl,
            section: ticket.section,
            row: ticket.row,
            seat: ticket.seat,
            gameTitle: gameData.title,
            gameDate: gameData.date,
            listed: isListed,
            price: ticketPrice,
        };
    });

    // Sort tickets by section, then row, then seat
    repeaterData.sort((a, b) => {
        // First sort by section
        if (a.section !== b.section) {
            return a.section.localeCompare(b.section);
        }
        // Then by row (handle both numeric and string rows)
        const rowA = isNaN(a.row) ? a.row : parseInt(a.row);
        const rowB = isNaN(b.row) ? b.row : parseInt(b.row);
        if (typeof rowA === 'number' && typeof rowB === 'number') {
            if (rowA !== rowB) return rowA - rowB;
        } else if (rowA !== rowB) {
            return String(rowA).localeCompare(String(rowB));
        }
        // Finally by seat (numeric)
        return a.seat - b.seat;
    });

    $w("#ticketRepeater").data = repeaterData;
    $w("#ticketRepeater").onItemReady(($item, itemData, index) => {
        // Set the fixed ticket details - itemData is now a ticket object
        $item("#gameTitle").text = itemData.gameTitle;
        $item("#gameDate").text = itemData.gameDate.toLocaleDateString("en-US", { month: 'short', day: 'numeric', year: 'numeric' });
        $item('#sectionText').text = itemData.section
        $item('#rowText').text = itemData.row
        $item('#seatText').text = itemData.seat.toString()
        $item("#ticketSwitch").checked = itemData.listed;
        // Show price if exists, otherwise show price input
        if (itemData.listed) {
            $item("#priceText").text = "$" + itemData.price.toFixed(0);
            $item("#priceText").expand();
        }
        else {
            $item("#priceText").collapse();
        }
        $item("#ticketSwitch").onChange((event) => {
            handleSwitchChange(event, $item, itemData, index);
        });
    });

    // Animation sequence: expand first, then collapse spinner, then show wrapper with animation
    $w("#ticketRepeater").expand();  // Expand repeater first
    $w("#spinner").collapse();  // Collapse spinner to remove from layout
    $w('#ticketWrapper').show("fade", { duration: 750 });  // Show wrapper with fade animation

    // Show save button
    $w("#saveButton").show();
    $w("#listMore").show();

    console.log("Tickets displayed in repeater");
}

$w('#chgPrice').onClick(async (event) => {
    let $item = $w.at(event.context)
    let seatId = $item("#sectionText").text + "-" + $item("#rowText").text + '-' + $item('#seatText').text + "-" + order

    try {
        const res = await wixWindowFrontend.openLightbox('Pricing', {seatId: seatId, game: gameId});

        if (res && res.price && res.scope) {
            console.log('Lightbox returned:', res);

            // Show status message
            $w("#statusMessage").text = "Updating prices...";
            $w("#statusMessage").show();
            $w("#spinner").show();

            // Update the price display
            $item('#priceText').text = "$" + parseFloat(res.price).toFixed(0);
            $item('#priceText').expand();

            // Call updatePrice with the lightbox response
            await updatePrice(res.scope, parseFloat(res.price), seatId, member);
        }
    } catch(err) {
        console.error('Lightbox error:', err);
        $w("#statusMessage").text = "Error updating price. Please try again.";
        $w("#statusMessage").show();
        $w("#spinner").hide();
    }
})



// Helper function to check if rows are adjacent (handles both numeric and string rows)
function areRowsAdjacent(row1, row2) {
    // Try numeric comparison first
    const num1 = parseInt(row1);
    const num2 = parseInt(row2);
    if (!isNaN(num1) && !isNaN(num2)) {
        return Math.abs(num1 - num2) <= 1;
    }
    // Handle string rows (A, B, C, etc.)
    const row1Char = row1.toString().toUpperCase();
    const row2Char = row2.toString().toUpperCase();
    if (row1Char.length === 1 && row2Char.length === 1) {
        const diff = Math.abs(row1Char.charCodeAt(0) - row2Char.charCodeAt(0));
        return diff <= 1;
    }
    return false;
}

// 4. Handle Price Input and Validation under adapted pricing rules
// Pricing is now handled through a lightbox (see #chgPrice button handler above)
// The lightbox returns: res.price, res.scope
// End of Section 4

 async function updatePrice(scope, newPrice, seatId, member) {
     let row = seatId.split("-")[1];
     let psl = null;

     // Filter to only tickets relevant to this game (either listed or pending to be listed)
     const gameRelevantTickets = allMemberTickets.filter(ticket => {
         const isListed = ticket.listedGames && ticket.listedGames.some(g => g._id === currentGame._id);
         const isUnlisted = ticket.unlistedGames && ticket.unlistedGames.some(u => u._id === currentGame._id);
         const isPending = pendingChanges.has(ticket._id) && pendingChanges.get(ticket._id).action === 'add';
         return isListed || isUnlisted || isPending;
     });

     // Extract PSL from seatId if needed
     if (scope === "set" || scope === "stack") {
         let [section, rowNum, seat] = seatId.split("-");
         let currentTicket = allMemberTickets.find(t =>
             t.section === section && t.row === rowNum && parseInt(t.seat) === parseInt(seat)
         );
         if (currentTicket && currentTicket.psl) {
             psl = currentTicket.psl._id;
         }
     }
     let toUpdate = [];
     if(scope === "all") {
         gameRelevantTickets.forEach((ticket) => {
             if (!ticket.listingPrices) ticket.listingPrices = [];
             ticket.listingPrices[order - 1] = newPrice;
             toUpdate.push(ticket);
         })
     } else if (scope === "row") {
         gameRelevantTickets.filter(x =>  x.row === row).forEach( (ticket) => {
             if (!ticket.listingPrices) ticket.listingPrices = [];
             ticket.listingPrices[order - 1] = newPrice;
             toUpdate.push(ticket);
         });
     } else if (scope === "set") {
         // Update only tickets with matching PSL
         gameRelevantTickets.filter(x => x.psl && x.psl._id === psl).forEach( (ticket) => {
             if (!ticket.listingPrices) ticket.listingPrices = [];
             ticket.listingPrices[order - 1] = newPrice;
             toUpdate.push(ticket);
         });
     } else if (scope === "stack") {
         // Get stackability info
         let stackResult = await stackable(seatId, member);

         if (stackResult.canStack) {
             // Full row can stack - use all tickets in stackableWith rows
             let stackableRows = stackResult.stackableWith.map(s => s.stackableRow);
             gameRelevantTickets.filter(x => stackableRows.includes(x.row) || x.row === parseInt(row)).forEach(ticket => {
                 if (!ticket.listingPrices) ticket.listingPrices = [];
                 ticket.listingPrices[order - 1] = newPrice;
                 toUpdate.push(ticket);
             });
         } else if (stackResult.hasGap && stackResult.stackableGroups.length > 0) {
             // Has gaps - update individual stackable groups
             let stackablePSLs = stackResult.stackableGroups.map(g => g.pslId);
             gameRelevantTickets.filter(x => x.psl && stackablePSLs.includes(x.psl._id)).forEach(ticket => {
                 if (!ticket.listingPrices) ticket.listingPrices = [];
                 ticket.listingPrices[order - 1] = newPrice;
                 toUpdate.push(ticket);
             });
         } else {
             // Nothing stackable - just update current PSL
             gameRelevantTickets.filter(x => x.psl && x.psl._id === psl).forEach( (ticket) => {
                 if (!ticket.listingPrices) ticket.listingPrices = [];
                 ticket.listingPrices[order - 1] = newPrice;
                 toUpdate.push(ticket);
             });
         }

         console.log("Stack result:", stackResult.msg);
     }
     if(toUpdate.length === 0) {
         throw Error("No tickets found for the selected scope.");
     }

     // Strip multi-reference fields before bulkUpdate
     // Per Wix docs: "The bulkUpdate() method does not support multi-reference fields."
     // AND "If the existing item had properties with values and those properties are not included
     // in the specified item, the values in those properties are lost."
     const toUpdateWithoutRefs = toUpdate.map(ticket => {
         const { listedGames, ...ticketWithoutRefs } = ticket;
         return ticketWithoutRefs;
     });

     await wixData.bulkUpdate("Season106TicketHoldings", toUpdateWithoutRefs, {suppressAuth: true})
         .then((results) => {
             console.log("Prices updated successfully:", results);
             return loadTicketsAndListings({
                 title: currentGame.title,
                 date: currentGame.date,
                 order: order,
             });
         })
         .then(() => {
             $w("#statusMessage").text = `Prices updated successfully! (${toUpdate.length} ticket${toUpdate.length > 1 ? 's' : ''})`;
             $w("#statusMessage").show();
             setTimeout(() => {
                 $w("#statusMessage").hide();
             }, 3000);
         })
         .catch((err) => {
             console.error("Error updating prices:", err);
             $w("#statusMessage").text = "Error updating prices. Please try again.";
             $w("#statusMessage").show();
         });
 }
// Handle switch changes
// Subprocess includes:
// - determining if the ticket is being listed or unlisted
// - updating the pendingChanges map accordingly
// - validating the overall ticket selection after each change
// End of Subprocess

function handleSwitchChange(event, $item, itemData, index) {
    // For Switch elements, use .checked property directly from the switch
    const switchState = $item("#ticketSwitch").checked;

    console.log(`Switch changed for ticket ${itemData._id}: ${switchState}`);

    // Determine action based on original checked state
    const wasListed = itemData.listed;

    if (switchState && !wasListed) {
        // User wants to list this ticket
        const ticket = allMemberTickets.find(t => t._id === itemData._id);
        if (ticket) {
            pendingChanges.set(itemData._id, { action: 'add', ticket: ticket });
            console.log(`Added to pending: ADD ticket ${itemData._id} to game ${currentGame._id}`);
        } else {
            console.error(`Ticket ${itemData._id} not found in allMemberTickets`);
        }
    } else if (!switchState && wasListed) {
        // User wants to unlist this ticket
        const ticket = allMemberTickets.find(t => t._id === itemData._id);
        if (ticket) {
            pendingChanges.set(itemData._id, { action: 'remove', ticket: ticket });
            console.log(`Added to pending: REMOVE ticket ${itemData._id} from game ${currentGame._id}`);
        } else {
            console.error(`Ticket ${itemData._id} not found in allMemberTickets`);
        }
    } else {
        // User toggled back to original state - remove from pending
        pendingChanges.delete(itemData._id);
        console.log(`Removed from pending: ticket ${itemData._id} back to original state`);
    }

    console.log(`Pending changes count: ${pendingChanges.size}`);

    // Validate ticket selections
    validateTicketSelection();
}

// Validate ticket selection logic (Addendum 2)
function validateTicketSelection() {
    // Get all tickets that will be listed after pending changes
    const finalListedTickets = allMemberTickets.filter(ticket => {
        const pending = pendingChanges.get(ticket._id);
        const isListed = ticket.listedGames && ticket.listedGames.some(g => g._id === currentGame._id);

        if (pending) {
            return pending.action === 'add';
        }
        return isListed;
    });

    console.log('Validating tickets:', finalListedTickets.length);

    if (finalListedTickets.length === 0) {
        // No tickets listed - valid state
        $w("#validationMessage").collapse();
        $w("#saveButton").enable();
        return true;
    }

    // Group tickets by section and row
    const grouped = new Map();
    finalListedTickets.forEach(ticket => {
        const key = `${ticket.section}-${ticket.row}`;
        if (!grouped.has(key)) {
            grouped.set(key, []);
        }
        grouped.get(key).push(ticket);
    });

    let hasErrors = false;
    const errors = [];

    // Validate each section/row group
    for (const [key, tickets] of grouped.entries()) {
        // Sort tickets by seat number
        tickets.sort((a, b) => a.seat - b.seat);

        // Test 1: No solo tickets (except if all tickets in section/row are being listed)
        const allTicketsInGroup = allMemberTickets.filter(t =>
            `${t.section}-${t.row}` === key
        );

        if (tickets.length === 1 && allTicketsInGroup.length > 1) {
            const soloTicket = tickets[0];
            const adjacentSeats = [soloTicket.seat - 1, soloTicket.seat + 1];
            const hasAdjacent = allTicketsInGroup.some(t =>
                adjacentSeats.includes(t.seat) &&
                finalListedTickets.includes(t)
            );

            if (!hasAdjacent) {
                hasErrors = true;
                const adjacentTicket = allTicketsInGroup.find(t =>
                    adjacentSeats.includes(t.seat)
                );
                if (adjacentTicket) {
                    errors.push(`Section ${soloTicket.section} Row ${soloTicket.row} Seat ${soloTicket.seat}: Cannot list solo ticket. Add seat ${adjacentTicket.seat}?`);
                } else {
                    errors.push(`Section ${soloTicket.section} Row ${soloTicket.row} Seat ${soloTicket.seat}: Cannot list solo ticket.`);
                }
            }
        }

        // Test 1.5: 3-ticket validation - only allow if starts at min OR ends at max
        if (tickets.length === 3) {
            // Sort all tickets in group by seat to find min/max
            const sortedAllTickets = allTicketsInGroup.slice().sort((a, b) => parseInt(a.seat) - parseInt(b.seat));
            const minSeat = parseInt(sortedAllTickets[0].seat);
            const maxSeat = parseInt(sortedAllTickets[sortedAllTickets.length - 1].seat);

            // Sort selected tickets by seat
            const selectedMinSeat = parseInt(tickets[0].seat);
            const selectedMaxSeat = parseInt(tickets[tickets.length - 1].seat);

            // Allow 3 tickets ONLY if:
            // 1. Starts at minimum seat, OR
            // 2. Ends at maximum seat
            if (selectedMinSeat !== minSeat && selectedMaxSeat !== maxSeat) {
                hasErrors = true;
                errors.push(`Section ${tickets[0].section} Row ${tickets[0].row}: 3-ticket selection must start at minimum seat (${minSeat}) or end at maximum seat (${maxSeat}).`);
            }
        }

        // Gap validation: A saleable unit must have 0 gaps (consecutive seats)
        // - Gap of 1 seat = ERROR (leaves unsaleable single seat)
        // - Gap of 2+ seats = VALID (separate saleable subunits with same PSL)
        if (tickets.length > 1) {
            for (let i = 0; i < tickets.length - 1; i++) {
                const currentSeat = tickets[i].seat;
                const nextSeat = tickets[i + 1].seat;
                const gap = nextSeat - currentSeat - 1;  // Number of seats missing between current and next

                // Gap of exactly 1 seat is not allowed (e.g., seats 14, 16 without 15)
                if (gap === 1) {
                    hasErrors = true;
                    errors.push(`Section ${tickets[i].section} Row ${tickets[i].row}: Cannot leave gap of 1 seat between ${currentSeat} and ${nextSeat}. Single seats are not saleable.`);
                }
                // Gap of 2+ seats is valid - indicates separate saleable subunits
            }
        }
    }

    // Display validation results
    if (hasErrors) {
        $w("#validationMessage").text = errors.join('\n');
        $w("#validationMessage").expand();
        $w("#saveButton").disable();
        console.warn('Validation errors:', errors);
        return false;
    } else {
        $w("#validationMessage").collapse();
        $w("#saveButton").enable();
        console.log('Validation passed');
        return true;
    }
}

// Wire up Save button
$w("#saveButton").onClick(async () => {
    console.log("Save button clicked");
    await batchSaveChanges().then(() => {
        $w('#saveButton').collapse()
        $w("#continue").expand()
        $w("#listMore").expand()
    })
});

// Phase 7: Batch Save Changes
async function batchSaveChanges() {
    if (pendingChanges.size === 0) {
        console.log("No listing changes to save");
        $w("#statusMessage").text = "No listing changes to save. (Note: Price changes are saved immediately when you update them.)";
        $w("#statusMessage").show();
        setTimeout(() => {
            $w("#statusMessage").hide();
        }, 4000);
        return;
    }

    console.log(`Saving ${pendingChanges.size} listing changes...`);
    $w("#saveButton").hide();
    $w("#spinner").show();
    if ($w("#statusMessage")) $w("#statusMessage").text = `Saving ${pendingChanges.size} listing changes...`;
    if ($w("#statusMessage")) $w("#statusMessage").show();

    try {
        const promises = [];

        for (const [ticketId, change] of pendingChanges.entries()) {
            const { action, ticket } = change;

            console.log(`Processing ticket:`, {
                ticketId,
                action,
                hasFullTicket: !!ticket,
                ticketData: ticket
            });

            if (action === 'add') {
                // Update listingPrices array before adding reference
                // Get price from ticket's listingPrices array (set during updatePrice function via lightbox)
                const listingPrices = ticket.listingPrices || [];
                const ticketPrice = listingPrices[order - 1] || 0;
                // Ensure price is stored (in case it wasn't set yet)
                if (!listingPrices[order - 1]) {
                    listingPrices[order - 1] = ticketPrice;
                }
                console.log(`Storing price ${listingPrices[order - 1]} at index ${order - 1} (game order: ${order})`);

                // Create update object with ALL fields EXCEPT multi-reference fields (listedGames)
                // Per Wix docs: "If the existing item had properties with values and those properties
                // were not included in the specified item, the values in those properties are lost."
                const { listedGames, ...ticketWithoutRefs } = ticket;
                const updatePromise = wixData.update("Season106TicketHoldings", {
                    ...ticketWithoutRefs,
                    listingPrices: listingPrices
                }).then(result => {
                    console.log(`Ticket ${ticketId} updated with price`);
                    return result;
                });
                promises.push(updatePromise);

                // Add game to listedGames multi-reference field separately
                // Per Wix docs: "The update() method does not support multi-reference fields.
                // For multi-reference fields, use replaceReferences() or insertReference()."
                console.log(`Adding game ${currentGame._id} to ticket ${ticket._id} listedGames`);
                const refPromise = wixData.insertReference("Season106TicketHoldings", "listedGames", ticket._id, currentGame._id)
                    .then(result => {
                        console.log(`insertReference SUCCESS for ticket ${ticketId}:`, result);
                        return result;
                    })
                    .catch(err => {
                        console.error(`insertReference FAILED for ticket ${ticketId}:`, err);
                        throw err;
                    });
                promises.push(refPromise);
            } else if (action === 'remove') {
                // Clear price from listingPrices array before removing reference
                const listingPrices = ticket.listingPrices || [];
                listingPrices[order - 1] = null;
                console.log(`Clearing price at index ${order - 1} (game order: ${order})`);

                // Create update object with ALL fields EXCEPT multi-reference fields (listedGames)
                // Per Wix docs: "If the existing item had properties with values and those properties
                // were not included in the specified item, the values in those properties are lost."
                const { listedGames, ...ticketWithoutRefs } = ticket;
                const updatePromise = wixData.update("Season106TicketHoldings", {
                    ...ticketWithoutRefs,
                    listingPrices: listingPrices
                }).then(result => {
                    console.log(`Price cleared for ticket ${ticketId}`);
                    return result;
                });
                promises.push(updatePromise);

                // Remove game from listedGames multi-reference field separately
                // Per Wix docs: "The update() method does not support multi-reference fields.
                // For multi-reference fields, use replaceReferences() or removeReference()."
                console.log(`Removing game ${currentGame._id} from ticket ${ticket._id} listedGames`);
                const refPromise = wixData.removeReference("Season106TicketHoldings", "listedGames", ticket._id, currentGame._id)
                    .then(result => {
                        console.log(`removeReference SUCCESS for ticket ${ticketId}:`, result);
                        return result;
                    })
                    .catch(err => {
                        console.error(`removeReference FAILED for ticket ${ticketId}:`, err);
                        throw err;
                    });
                promises.push(refPromise);
            }
        }

        // Execute all reference updates in parallel
        const results = await Promise.all(promises);
        await saveListing(results);
        console.log("Promise.all results:", results);

        // Clear pending changes after successful save
        pendingChanges.clear();
        console.log("Pending changes cleared");

        // Save listing to Listings collection


        // Reload tickets to reflect new state
        allMemberTickets = await loadGameTickets();

        // Show only tickets that are listed OR unlisted for this game
        let isListed = allMemberTickets.filter(ticket => ticket.listedGames && ticket.listedGames.some(g => g._id === currentGame._id));
        let isUnlisted = allMemberTickets.filter(ticket => ticket.unlistedGames && ticket.unlistedGames.some(u => u._id === currentGame._id));
        allGameTickets = isListed.concat(isUnlisted);

        await displayTicketsInRepeater(allGameTickets, { title: currentGame.title, date: currentGame.date, order: order });

        if ($w("#statusMessage")) $w("#statusMessage").text = "Changes saved successfully!";
        setTimeout(() => {
            if ($w("#statusMessage")) $w("#statusMessage").hide();
        }, 2000);

    } catch (error) {
        console.error("Error saving changes:", error);
        $w("#spinner").hide();
        $w("#saveButton").show();
        if ($w("#statusMessage")) {
            $w("#statusMessage").text = "Error saving changes. Please try again.";
            $w("#statusMessage").show();
        }
    }
}

// Save listing to Listings collection
// One row per ticket with game columns showing status (listed/sold/unlisted)
async function saveListing(results) {
    try {
        // Process each ticket that changed in this save operation
        for (const [ticketId, change] of pendingChanges.entries()) {
            const { action, ticket } = change;

            // Query for existing listing row for this ticket
            const existingResult = await wixData.query("Listings")
                .eq("title", ticketId)
                .find({ suppressAuth: true });

            let entry = existingResult.items[0] || {
                title: ticketId,
                memberId: member._id,
                sellerId: member.contactId,
                psl: ticket.psl._id
            };

            // Update the status column for the current game
            entry[`game${order}`] = (action === 'add') ? 'listed' : 'unlisted';

            // Save the listing row
            await wixData.save("Listings", entry, { suppressAuth: true });
            console.log(`Listing saved for ticket ${ticketId}, game${order}: ${entry[`game${order}`]}`);
        }
    } catch (error) {
        console.error("Error saving listings:", error);
    }
}

function detectSeatGroups(seats) {
    if (seats.length === 0) return [];

    let groups = [];
    let currentGroup = [seats[0]];

    for (let i = 1; i < seats.length; i++) {
        // If gap is 2 or more, start a new group
        if (seats[i] - seats[i - 1] >= 2) {
            groups.push(currentGroup);
            currentGroup = [seats[i]];
        } else {
            currentGroup.push(seats[i]);
        }
    }
    groups.push(currentGroup); // Add the last group

    return groups;
}

async function stackable(seatId, member) {
    let response = [];
    let stackableGroups = [];
    let msg = "";
    let canStack = false;
    let section = seatId.split("-")[0];
    let row = parseInt(seatId.split("-")[1]);
    let seat = parseInt(seatId.split("-")[2]);
    let order = parseInt(seatId.split("-")[3]);
    let gameId = GAMESARRAY[order - 1];

     let allSellerTickets = await wixData.query("Season106TicketHoldings")
        .include("listedGames")
        .include("psl")
        .eq("seller", member._id)
        .find({suppressAuth: true});

    let gameTickets = allSellerTickets.items.filter(item => item.listedGames && item.listedGames.some(g => g._id === gameId));

    let sameSection = gameTickets.filter(ticket => ticket.section === section);

    // Get all tickets in the reference row
    let referenceRowTickets = sameSection.filter(ticket => ticket.row === row);
    let referenceSeats = referenceRowTickets.map(ticket => ticket.seat).sort((a, b) => a - b);

    // Detect gaps in reference row
    let referenceGroups = detectSeatGroups(referenceSeats);
    let hasGap = referenceGroups.length > 1;

    // Map reference groups to their PSLs and validate consistency
    let referenceGroupsWithPSL = referenceGroups.map(group => {
        let groupTickets = referenceRowTickets.filter(t => group.includes(t.seat));
        let psls = [...new Set(groupTickets.map(t => t.psl?._id))];

        if (psls.length > 1) {
            console.warn(`Warning: Group ${group[0]}-${group[group.length - 1]} has multiple PSLs: ${psls.join(', ')}`);
        }

        return {
            seats: group,
            pslId: psls[0], // Use first PSL (should all be same)
            tickets: groupTickets
        };
    });

    // Check adjacent rows (row + 1 and row - 1)
    let adjacentRows = sameSection.filter(ticket => Math.abs(ticket.row - row) === 1);

    // Group adjacent tickets by row
    let rowGroups = {};
    let adjacentTicketsByRow = {};
    adjacentRows.forEach(ticket => {
        if (!rowGroups[ticket.row]) {
            rowGroups[ticket.row] = [];
            adjacentTicketsByRow[ticket.row] = [];
        }
        rowGroups[ticket.row].push(ticket.seat);
        adjacentTicketsByRow[ticket.row].push(ticket);
    });

    // Check each adjacent row
    for (let adjacentRow in rowGroups) {
        let adjacentSeats = rowGroups[adjacentRow].sort((a, b) => a - b);
        let adjacentGroups = detectSeatGroups(adjacentSeats);
        let adjacentHasGap = adjacentGroups.length > 1;

        // If NO gaps in reference row, match full row
        if (!hasGap) {
            if (adjacentSeats.length === referenceSeats.length &&
                adjacentSeats.every((seat, index) => seat === referenceSeats[index])) {
                canStack = true;
                msg = `Row ${row} can stack with Row ${adjacentRow} (seats ${referenceSeats.join(', ')})`;
                response.push({
                    stackableRow: parseInt(adjacentRow),
                    pslId: adjacentTicketsByRow[adjacentRow][0].psl._id,
                    seats: referenceSeats
                });
            }
        }
        // If gaps exist, match groups independently
        else {
            // Try to match each reference group to adjacent groups
            for (let refGroupWithPSL of referenceGroupsWithPSL) {
                let refGroup = refGroupWithPSL.seats;
                for (let adjGroup of adjacentGroups) {
                    // Check if this reference group matches this adjacent group
                    if (refGroup.length === adjGroup.length &&
                        refGroup.every((seat, index) => seat === adjGroup[index])) {

                        let groupDesc = refGroup.length === 1 ? `${refGroup[0]}` : `${refGroup[0]}-${refGroup[refGroup.length - 1]}`;
                        stackableGroups.push({
                            stackableRow: parseInt(adjacentRow),
                            seats: refGroup,
                            description: groupDesc,
                            pslId: refGroupWithPSL.pslId  // PSL from reference row
                        });
                    }
                }
            }
        }
    }

    // Determine result based on gaps
    if (hasGap) {
        if (stackableGroups.length > 0) {
            let groupDescs = stackableGroups.map(g => g.description).join(', ');
            msg = `Row ${row} has ${referenceGroupsWithPSL.length} separate PSL groups. Individual groups stackable: ${groupDescs}`;
        } else {
            let groupDescriptions = referenceGroupsWithPSL.map(g => {
                let desc = g.seats.length === 1 ? `${g.seats[0]}` : `${g.seats[0]}-${g.seats[g.seats.length - 1]}`;
                return desc;
            }).join(', ');
            msg = `No stackable groups found for Row ${row}. Reference has ${referenceGroupsWithPSL.length} seat groups: ${groupDescriptions}`;
        }
    } else {
        if (response.length > 0) {
            canStack = true;
        } else {
            msg = `No stackable rows found for Row ${row}`;
        }
    }

    return {
        canStack,
        stackableWith: response,
        stackableGroups: hasGap ? stackableGroups : [],
        msg,
        hasGap,
        seatGroups: referenceGroups
    };
}