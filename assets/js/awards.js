/**
 * Created by karthik on 10/30/16.
 */

$(document).ready(function () {

    d3.json("/assets/data/awards.json", function (data) {

        d3.select(".page__title").remove();

        // Empty the div
        d3.select("#awardsList").empty();
        var awardsList = d3.select("#awardsList").style("float", "left").style("padding-left", "0px");
        awardsList.append("h1").html("Awards <hr/>").style("margin", "0px");


        // Empty the div
        d3.select("#pressList").empty();
        var pressList = d3.select("#pressList").style("float", "left").style("padding-left", "0px");
        pressList.append("h1").html("Press <hr/>").style("margin", "0px");

        // posts
        awardsContent = awardsList.append("div").attr("id", "awardsContent");
        pressContent = pressList.append("div").attr("id", "pressContent");

        data.forEach(function (datum, i) {
            if (datum.type == "Award") {
                showAward(awardsContent, datum, i);
            } else if (datum.type == "Press") {
                showPress(pressContent, datum, i);
            }

        });

    });

});

function showAward (awardsContent, award, i) {

    var pro = awardsContent.append("div").style("display", "block")
        .style("padding-left", "10px")
        .style("line-height", "1")
        .style("background", "white")
        .style("padding-bottom", "13px");

    pro.append("div").style("width", "100px")
        .style("display", "inline-block")
        .style("vertical-align", "top")
        .style("font-size", "14px")
        .text(award.date);

    var proInfo = pro.append("div").style("width", "calc(100% - 100px)")
        .style("background", "white")
        .style("padding-left", "10px")
        .style("display", "inline-block");


    proInfo.append("div").html('<a target="_blank" href="' + award.link + '">' + award.title + '</a>').style("font-size", "14px");

    if ("abstract" in award) {
        proInfo.append("span").html(award.abstract + " ").style("font-size", "12px");
    }

    // proInfo.append("span").attr("class", "textlink").html('<a target="_blank" href="' + award.link + '">[Link]</a>  ').style("font-size", "12px");


}

function showPress (pressContent, press, i) {

    var pro = pressContent.append("div").style("display", "block")
        .style("padding-left", "10px")
        .style("line-height", "1")
        .style("background", "white")
        .style("padding-bottom", "20px");

    pro.append("div").style("width", "100px")
        .style("height", "72px")
        .style("display", "inline-block")
        .style("border", "1.5px solid #222")
        .style("background-size", "cover")
        .style("background-repeat", "no-repeat")
        .style("vertical-align", "bottom")
        .style("background-image", "url(/assets/images/" + press.name + ".png");

    var proInfo = pro.append("div").style("width", "calc(100% - 100px)")
        .style("background", "white")
        .style("padding-left", "10px")
        .style("display", "inline-block");


    proInfo.append("div").html('<a target="_blank" href="' + press.link + '">' + press.title + '</a>').style("font-size", "14px");
    proInfo.append("span").html(press.abstract + "<br/>").style("font-size", "12px");
    proInfo.append("span").attr("class", "textlink").html('<a target="_blank" href="' + press.link + '">[Link]</a>  ').style("font-size", "12px");
    proInfo.append("span").attr("class", "textlink").html(press.date + '<br/>').style("font-size", "12px");

}


