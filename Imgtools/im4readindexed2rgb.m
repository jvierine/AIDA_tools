function imRGB = im4readindexed2rgb(filename)
%UNTITLED2 Summary of this function goes here
%   Detailed explanation goes here


[im,cmap] = imread(filename);
imRGB = ind2rgb(im,cmap);
