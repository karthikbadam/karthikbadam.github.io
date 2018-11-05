/**
 * Created by karthik on 10/29/16.
 */

$(document).ready(function () {   

    d3.json("/assets/data/overview.json", function (data) {

        d3.select(".page__title").remove();

        // Empty the div
        d3.select("#postsList").empty();
        var postsList = d3.select("#postsList").style("float", "left").style("padding-left", "0px");
        postsList.append("h1").html("Recent blog posts <hr/>").style("margin", "0px");


        // Empty the div
        d3.select("#newsList").empty();
        var newsList = d3.select("#newsList").style("float", "left").style("padding-left", "0px");
        newsList.append("h1").html("Recent news <hr/>").style("margin", "0px");

        // posts
        postsContent = postsList.append("div").attr("id", "postsContent");
        newsContent = newsList.append("div").attr("id", "newsContent");

        data.forEach(function (datum, i) {
            if (datum.type == "Blog Post") {
                showPost(postsContent, datum, i);
            } else if (datum.type == "News") {
                showNews (newsContent, datum, i)
            }

        });

    });

});

function showNews (newsContent, news, i) {

    var pro = newsContent.append("div").style("display", "block")
        .style("padding-left", "10px")
        .style("line-height", "1")
        .style("background", "white")
        .style("padding-bottom", "13px");

    pro.append("div").style("width", "100px")
        .style("display", "inline-block")
        .style("vertical-align", "top")
        .style("font-size", "14px")
        .text(news.date);

    var proInfo = pro.append("div").style("width", "calc(100% - 100px)")
        .style("background", "white")
        .style("padding-left", "10px")
        .style("display", "inline-block");


    proInfo.append("div").html(news.title).style("font-size", "14px");
    proInfo.append("span").html(news.abstract).style("font-size", "12px");

}

function showPost (postsContent, post, i) {

    var pro = postsContent.append("div").style("display", "block")
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
        .style("background-image", "url(/assets/images/" + post.name + ".png)");

    var proInfo = pro.append("div").style("width", "calc(100% - 100px)")
        .style("background", "white")
        .style("padding-left", "10px")
        .style("display", "inline-block");


    proInfo.append("div").html('<a target="_blank" href="' + post.link + '">' + post.title + '</a>').style("font-size", "14px");
    proInfo.append("span").html(post.abstract + "<br/>").style("font-size", "12px");
    proInfo.append("span").attr("class", "textlink").html('<a target="_blank" href="' + post.link + '">[Link]</a>  ').style("font-size", "12px");
    if (post.video)
        proInfo.append("span").attr("class", "textlink").html('<a target="_blank" href="' + post.video + '">[Video]</a>  ').style("font-size", "12px");
    proInfo.append("span").attr("class", "textlink").html(post.date + '<br/>').style("font-size", "12px");

}

