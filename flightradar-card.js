/*
 * FlightRadar Card compatibility loader.
 *
 * The card is now served by the Home Assistant integration at
 * /flightradar_card/flightradar-card.js.
 *
 * Keep this file for users who previously registered the legacy HACS
 * resource /hacsfiles/ha-flightradar-card/flightradar-card.js.
 * It deliberately does not register a second card implementation.
 */

import "/flightradar_card/flightradar-card.js?v=0.8.3";
