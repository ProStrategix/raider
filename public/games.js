
export async function setUpGame ($item) {
currentGame = $item("#dataset1").getCurrentItem()

let gameData = {
        id: currentGame._id,
        title: currentGame.title,
        date: currentGame.date,
        order: order,
    }

    setTimeout(() => {
        $w("#ticketWrapper").expand()
        $w("#step3").expand()
        $w("#statusMessage").text = "Loading tickets..."
        $w("#statusMessage").show()
        $w("#spinner").expand()
       return gameData;
    }, 800);

}